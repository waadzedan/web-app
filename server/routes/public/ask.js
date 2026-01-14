import express from "express";
import fetch from "node-fetch";
import { db } from "../../server.js";
import askLabs from "./askLabs.js";
import {
  isRegistrationQuestion,
  classifyRegistrationIntent,
  refineRegistrationIntent,
  extractSemesterNumber,
  getRegDoc,
  getAllRegDocs,
  buildRegistrationAnswer,
  buildAllAdvisorsAnswer,
  buildAllLabsAnswer

} from "./registration.service.js";

const router = express.Router();
const MODEL = "gemini-2.5-flash";
function isLabQuestion(question = "") {
  const q = question.toLowerCase();

  // חייב להיות אזכור זמן / לוח
  const timeKeywords = [
    "מתי",
    "מה",
    "איזה יום",
    "איזה תאריך",
    " תאריך",
    "היום",
    "מחר",
    "השבוע",
    "שעה",
    "באיזה",
    "יש",
    "לוח",
    "זמן",
    "מפגש",
    "שעות"
  ];

  const labWords = ["מעבדה", "מעבדות","מע"];

  return (
    labWords.some(w => q.includes(w)) &&
    timeKeywords.some(t => q.includes(t))
  );
}


/* =============================
   Utils
============================= */

const normalizeHebrew = (s = "") =>
  String(s)
    .replace(/["׳״'`]/g, "")    // הסרת גרשיים
    .replace(/[.-]/g, " ")       // החלפת נקודות ומקפים ברווח
    .replace(/\s+/g, " ")       // צמצום רווחים כפולים לרווח אחד
    .toLowerCase()
    .trim();

const isCourseCode = (s) =>
  /^\d{5,6}$/.test(String(s || "").trim());

// extract course code from free text
function extractCourseCode(question = "") {
  const m = String(question).match(/\b\d{5,6}\b/);
  return m ? m[0] : null;
}

function safeParseJson(text) {
  if (!text) return null;

  const cleaned = String(text)
    .replace(/```json|```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;

  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
const _coursesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getAllCoursesCached(yearbookId) {
    const now = Date.now();
    const cached = _coursesCache.get(yearbookId);
    if (cached && now - cached.ts < CACHE_TTL_MS) return cached.courses;

    const coursesRef = db.collection("yearbooks").doc(yearbookId).collection("requiredCourses");
    const semestersSnap = await coursesRef.get();
    const coursePromises = semestersSnap.docs.map((sem) => sem.ref.collection("courses").get());
    const coursesSnaps = await Promise.all(coursePromises);

    const allCourses = [];
    coursesSnaps.forEach((snap) => {
        snap.forEach((doc) => {
            const data = doc.data() || {};
            allCourses.push({
                courseCode: String(data.courseCode || doc.id),
                courseName: String(data.courseName || ""),
                nameNorm: normalizeHebrew(data.courseName),
                codeNorm: String(data.courseCode).replace(/\s+/g, "")
            });
        });
    });
    
    _coursesCache.set(yearbookId, { ts: now, courses: allCourses });
    return allCourses;
}
// match single course or code
function matchCourse(raw, courses, nameIndex) {
  if (!raw) return null;

  const s = String(raw).trim();

  if (isCourseCode(s)) {
    return courses.find((c) => c.courseCode === s) || null;
  }

  const n = normalizeHebrew(s);
  if (!n) return null;

  if (nameIndex.has(n))
    return nameIndex.get(n);

  for (const [key, course] of nameIndex.entries()) {
    if (key.includes(n) || n.includes(key))
      return course;
  }

  return null;
}

// Gemini classifier – ONLY determine kind
async function classifyQuestion(question) {
  const classifierPrompt = `
החזירי JSON בלבד בפורמט הבא:
{
  "kind": "lookup" | "relation",
  "courseA": "שם קורס או קוד א",
  "courseB": "שם קורס או קוד ב (רק אם זה relation)"
}

שאלה:
"${question}"
`;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=` +
      process.env.GEMINI_API_KEY;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: classifierPrompt }] }],
        generationConfig: { temperature: 0 },
      }),
    });

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return safeParseJson(text);

  } catch {
    return null;
  }
}

// simple intent detector fallback (before / parallel / general)
function detectIntent(question = "") {
  const s = String(question).toLowerCase();
  if (s.includes("לפני") || s.includes("קדם")) return "before";
  if (s.includes("במקביל") || s.includes("צמוד")) return "parallel";
  return "general";
}

// get relation type from firestore
async function getRelationType(yearbookId, courseA_code, courseB_code) {
  const semSnap = await db
    .collection("yearbooks")
    .doc(yearbookId)
    .collection("requiredCourses")
    .get();

  for (const sem of semSnap.docs) {
    const relRef = sem.ref
      .collection("courses")
      .doc(courseA_code)
      .collection("relations")
      .doc(courseB_code);

    const relSnap = await relRef.get();

    if (relSnap.exists) {
      return relSnap.data()?.type || null;
    }
  }

  return null;
}
async function getAllPrerequisites(yearbookId, courseCode) {
    const prereqs = [];
    const semSnap = await db.collection("yearbooks").doc(yearbookId).collection("requiredCourses").get();

    for (const sem of semSnap.docs) {
        const relsSnap = await sem.ref
            .collection("courses")
            .doc(courseCode)
            .collection("relations")
            .where("type", "==", "PREREQUISITE")
            .get();

        relsSnap.forEach(doc => {
            // לוקח את שם הקורס מהשדה courseName בתוך ה-relation
            prereqs.push(doc.data().courseName || doc.id);
        });
    }
    return prereqs;
}
function buildEmotionPrompt(question) {
  return `
את מערכת שמזהה מצוקה רגשית של סטודנטים.

החזירי JSON בלבד בפורמט:
{ "intent": "emotional_support" | "other" }

סווגי כ-"emotional_support" אם יש ביטוי אישי של קושי,
גם אם מוזכרים לימודים או קורסים.

דוגמאות למצוקה:
- קשה לי
- אני לא מצליחה
- אני תקועה
- אני טובעת
- לא הולך לי
- אני בלחץ
- לא מבינה כלום

סווגי כ-"other" רק אם השאלה היא מידע אקדמי טכני בלבד
(קוד קורס, דרישות קדם, לוח זמנים).

שאלה:
"${question}"
`;
}

async function detectEmotion(question) {
  const prompt = buildEmotionPrompt(question);

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=` +
    process.env.GEMINI_API_KEY;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return safeParseJson(text);
}


/* =============================
   Route
============================= */

router.post("/ask", async (req, res) => {
  try {
    const { yearbookId, question } = req.body || {};
    if (!question || !yearbookId) return res.status(400).json({ html: "❌ חסרה שאלה" });

    if (isLabQuestion(question)) return askLabs(req, res);
    // =============================
    // Registration (via service)
    // =============================
if (isRegistrationQuestion(question)) {

  // 1️⃣ סיווג כוונה (עם fallback)
  const intentObj = await classifyRegistrationIntent(question);
  const finalIntent =
    refineRegistrationIntent(intentObj?.intent, question) || "general";

  // 2️⃣ חילוץ סמסטר (אם קיים)
  const semNum = extractSemesterNumber(question);

  // =================================================
  // 1. "מתי הרישום?" בלי סמסטר → כל הסמסטרים
  // =================================================
  if (finalIntent === "window" && !semNum) {
    const allDocs = await getAllRegDocs();

    const html = `
      <div class="text-sm leading-6">
        <b>⏰ חלונות רישום לכל הסמסטרים</b><br/><br/>
        ${allDocs.map(d => `
          <div class="mb-2">
            <b>סמסטר ${d.semesterNumber}</b>
            ${d.audience?.cohortText ? ` (${d.audience.cohortText})` : ""}<br/>
            ${d.registrationWindow?.date}
            בין ${d.registrationWindow?.from} ל-${d.registrationWindow?.to}
          </div>
        `).join("")}
      </div>
    `;
    return res.json({ html });
  }

  // =================================================
  // 2. שאלות כלליות בלי סמסטר
  // =================================================
  if (!semNum) {
    const allDocs = await getAllRegDocs();

    // ---------- נקודות זכות כלליות ----------
    if (finalIntent === "credits") {
      return res.json({
        html: `
          <div class="text-sm">
            <b>נקודות זכות לתואר</b><br/>
            נדרש מינימום 165 נ״ז
          </div>
        `
      });
    }

    // ---------- פטורים / חריגים ----------
    if (finalIntent === "exemptions") {
      return res.json({
        html: `
          <div class="text-sm">
            ℹ️ פטורים וחריגים מטופלים מול הגורם האקדמי הרלוונטי.<br/>
            אנא צייני סמסטר או פני ליועץ/ת האקדמי/ת.
          </div>
        `
      });
    }

    // ---------- אנשי קשר כלליים ----------
    if (finalIntent === "contacts") {
      return res.json({
        html: `
          <div class="text-sm">
            ℹ️ לפניות בנושא רישום ניתן לפנות ליועצים האקדמיים
            או לתמיכת הרישום של הסמסטר הרלוונטי.
          </div>
        `
      });
    }

    // ---------- יועצים ----------
    if (finalIntent === "advisors") {
      return res.json({ html: buildAllAdvisorsAnswer(allDocs) });
    }

    // ---------- מעבדות ----------
    if (finalIntent === "labs") {
      return res.json({ html: buildAllLabsAnswer(allDocs) });
    }

    // ---------- מלווה ----------
    if (finalIntent === "mentors") {
      const docsWithMentors = allDocs.filter(
        d => (d.contacts?.mentors || []).length > 0
      );

      if (!docsWithMentors.length) {
        return res.json({
          html: `<div class="text-sm">ℹ️ אין סטודנט/ית מלווה בשנתון זה.</div>`
        });
      }

      // אצלך בפועל – רק סמסטר 1
      if (docsWithMentors.length === 1) {
        const d = docsWithMentors[0];
        const m = d.contacts.mentors[0];

        return res.json({
          html: `
            <div class="text-sm leading-6">
              👩‍🎓 <b>סטודנט/ית מלווה יש רק בסמסטר ${d.semesterNumber}</b><br/><br/>
              • <b>${m.name}</b><br/>
              <a href="mailto:${m.email}">${m.email}</a>
            </div>
          `
        });
      }

      return res.json({ html: buildAllMentorsAnswer(allDocs) });
    }

    // ---------- קישורי הדרכה ----------
    if (finalIntent === "links") {
      const docsWithLinks = allDocs.filter(
        d => (d.links || []).length > 0
      );

      if (!docsWithLinks.length) {
        return res.json({
          html: `<div class="text-sm">ℹ️ לא נמצאו קישורי הדרכה.</div>`
        });
      }

      if (docsWithLinks.length === 1) {
        return res.json({
          html: buildRegistrationAnswer("links", docsWithLinks[0])
        });
      }

      return res.json({
        html: `
          <div class="text-sm">
            <b>קישורי הדרכה לפי סמסטר</b><br/><br/>
            ${docsWithLinks.map(d =>
              `<b>סמסטר ${d.semesterNumber}</b><br/>` +
              d.links.map(l =>
                `• <a href="${l.url}" target="_blank">${l.label}</a>`
              ).join("<br/>")
            ).join("<br/><br/>")}
          </div>
        `
      });
    }

    // ---------- סטאז' בלי סמסטר ----------
    if (finalIntent === "internship") {
      return res.json({
        html: `<div class="text-sm">ℹ️ תנאי סטאז' משתנים לפי סמסטר. אנא צייני סמסטר.</div>`
      });
    }

    // ---------- כללי ----------
    if (finalIntent === "general") {
      return res.json({
        html: `
          <div class="text-sm">
            ℹ️ ניתן לשאול על רישום: חלון רישום, יועצים, מעבדות,
            מלווה, נקודות זכות, קישורים או תנאי סטאז'.
          </div>
        `
      });
    }

    // fallback
    return res.json({
      html: `<div class="text-sm">ℹ️ אנא צייני סמסטר (לדוגמה: סמסטר 2)</div>`
    });
  }

  // =================================================
  // 3. יש סמסטר → תשובה ספציפית
  // =================================================
  const regDoc = await getRegDoc(semNum);
  if (!regDoc) {
    return res.json({
      html: `<div class="text-sm">❌ לא מצאתי הנחיות רישום לסמסטר ${semNum}.</div>`
    });
  }

  // ---------- סטאז' עם סמסטר ----------
  if (finalIntent === "internship") {
    const rules = (regDoc.keyRules || []).filter(r =>
      r.code?.includes("INTERNSHIP")
    );

    if (!rules.length) {
      return res.json({
        html: `<div class="text-sm">ℹ️ אין מידע על סטאז' בסמסטר זה.</div>`
      });
    }

    return res.json({
      html: `
        <div class="text-sm">
          <b>תנאי סטאז' – סמסטר ${semNum}</b><br/><br/>
          ${rules.map(r => `• ${r.text}`).join("<br/>")}
        </div>
      `
    });
  }

  // ---------- ברירת מחדל: תשובת סמסטר ----------
  const html = buildRegistrationAnswer(finalIntent, regDoc);
  return res.json({ html });
}



    // שימוש ב-CACHE (במקום קריאה ישירה ל-Firestore)
    const allCourses = await getAllCoursesCached(yearbookId);
    const nameIndex = new Map();
    allCourses.forEach(c => {
      nameIndex.set(c.nameNorm, c);
      nameIndex.set(c.codeNorm, c);
    });

    const [emotion, classification] = await Promise.all([
      detectEmotion(question),
      classifyQuestion(question)
    ]);

    const courseA = matchCourse(classification?.courseA || question, allCourses, nameIndex);
    const courseB = matchCourse(classification?.courseB, allCourses, nameIndex);
    // 5. בדיקת רגש - רק אם לא זוהה קורס אקדמי מובהק (מונע את הבלבול)
    if (emotion?.intent === "emotional_support" && !courseA) { 
        return res.json({
          html: `
            <div class="text-sm leading-6">
              💙 זה בסדר להרגיש ככה, את לא לבד.<br/>
              הרבה סטודנטים חווים עומס ובלבול במהלך הלימודים.<br/><br/>
              אפשר וכדאי לפנות ליועץ/ת האקדמי/ת שלך או לדיקנט הסטודנטים.<br/>
              ניתן למצוא יועץ/ת דרך התפריט למטה 👇
            </div>
          `
        });
    }

    // 6. טיפול ב-LOOKUP
    if (classification?.kind === "lookup" || (courseA && !courseB)) {
      if (courseA) {
        return res.json({
          html: `<div class="text-sm">✅ <b>${courseA.courseName}</b> (${courseA.courseCode})</div>`
        });
      }
    }

    // 7. טיפול ב-RELATION
    if (classification?.kind === "relation" || (courseA && courseB)) {
      if (!courseA || !courseB) {
        return res.json({
          html: `<div class="text-sm">❌ לא הצלחתי לזהות את שני הקורסים שציינת.</div>`
        });
      }

      const intent = detectIntent(question);
      const relType = await getRelationType(yearbookId, courseA.courseCode, courseB.courseCode);
      const prereqs = await getAllPrerequisites(yearbookId, courseA.courseCode);

      let answer = "";
      if (intent === "before") {
        if (relType === "PREREQUISITE") {
          answer = `❌ לא ניתן ללמוד <b>${courseA.courseName}</b> לפני <b>${courseB.courseName}</b>`;
        } else if (relType === "COREQUISITE") {
          answer = `⚠️ הקורסים צמודים – יש ללמוד במקביל`;
        } else {
          answer = `לפי הנתונים בשנתון, ל־<b>${courseA.courseName}</b> ${prereqs.length > 0 ? `יש קורסי קדם:<br/>${prereqs.map(p => `• ${p}`).join("<br/>")}` : 'אין קורסי קדם.'}<br/><br/>אם סיימת את דרישות הקדם – לא צפויה בעיה.`;
        }
      } 
      else if (intent === "parallel") {
        if (relType === "COREQUISITE") {
          answer = `✅ ניתן ללמוד <b>${courseA.courseName}</b> במקביל עם <b>${courseB.courseName}</b>`;
        } else if (relType === "PREREQUISITE") {
          answer = `⚠️ לא מומלץ/לא אפשרי במקביל: <b>${courseB.courseName}</b> הוא <b>קורס קדם</b> ל־<b>${courseA.courseName}</b>.`;
        } else {
          answer = `לפי הנתונים בשנתון, ל־<b>${courseA.courseName}</b> ${prereqs.length > 0 ? `יש קורסי קדם:<br/>${prereqs.map(p => `• ${p}`).join("<br/>")}` : 'אין קורסי קדם.'}<br/><br/>אם סיימת את דרישות הקדם – לא צפויה בעיה.`;
        }
      } 
      else {
        if (relType === "PREREQUISITE") {
          answer = `ℹ️ <b>${courseB.courseName}</b> הוא קורס קדם ל־<b>${courseA.courseName}</b>`;
        } else {
          answer = `לפי הנתונים בשנתון, ל־<b>${courseA.courseName}</b> ${prereqs.length > 0 ? `יש קורסי קדם:<br/>${prereqs.map(p => `• ${p}`).join("<br/>")}` : 'אין קורסי קדם.'}<br/><br/>אם סיימת את דרישות הקדם – לא צפויה בעיה.`;
        }
      }

      return res.json({ html: `<div class="text-sm">${answer}</div>` });
    }

    // Default ברירת מחדל
    return res.json({ 
      html: `<div class="text-sm">ℹ️ לא מצאתי תשובה מדויקת. אם שאלת על קורס, וודאי שרשמת את שמו המלא. אם את/ה חווה קושי, אנחנו כאן.</div>` 
    });

  } catch (err) {
    console.error("ASK ERROR:", err);
    return res.status(500).json({ html: "⚠️ שגיאה בעיבוד הבקשה." });
  }
  
});
router.get("/courses/suggest", async (req, res) => {
  try {
    const { yearbookId, q: qRaw } = req.query;
    if (!yearbookId || !qRaw) return res.json({ suggestions: [] });
    
    // נירמול השאילתה (שומר על רווחים)
    const query = normalizeHebrew(qRaw); 
    const courses = await getAllCoursesCached(yearbookId);
    
    const results = courses
      .map(c => {
        // חשוב: nameNorm חייב להיווצר עם הפונקציה החדשה ששומרת רווחים!
        const name = c.nameNorm || normalizeHebrew(c.courseName);
        const code = c.codeNorm || String(c.courseCode).trim();
        let score = 0;

        // 1. התאמה מושלמת (הכי גבוה)
        if (name === query || code === query) {
          score = 200; 
        } 
        // 2. התחלה של השם (גבוה)
        else if (name.startsWith(query)) {
          score = 150;
        }
        // 3. מכיל את השאילתה כרצף (באמצע או בסוף - למשל "חדוא")
        else if (name.includes(query)) {
          score = 100;
        } 
        // 4. חיפוש מילים מפוצלות (למשל אם כתבו "מעבדה ביו")
        else {
          const queryWords = query.split(" ").filter(w => w.length >= 2);
          const matched = queryWords.filter(word => name.includes(word));

          if (matched.length > 0) {
            score = 60 + matched.length * 10;
          }
        }

        return { ...c, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score) 
      .slice(0, 10);

    res.json({ suggestions: results });
  } catch (err) {
    console.error("SUGGEST ERROR:", err);
    res.status(500).json({ error: "failed" });
  }
});

export default router;
