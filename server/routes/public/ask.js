import express from "express";
import fetch from "node-fetch";
import { db } from "../../server.js";
import askLabs from "./askLabs.js";

const router = express.Router();
const MODEL = "gemini-2.5-flash";
function isLabQuestion(question = "") {
  const q = question.toLowerCase();

  // חייב להיות אזכור זמן / לוח
  const timeKeywords = [
    "מתי",
    "מי",
    "מה",
    "איזה יום",
    "איזה תאריך",
    " תאריך",
    "היום",
    "מחר",
    "השבוע",
    "שעה",
    "באיזה",
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
    .replace(/["׳״'`]/g, "")
    .replace(/\s+/g, "")
    .replace(/[-–—]/g, "")
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

    if (!question || !yearbookId) {
      return res.status(400).json({ html: "❌ חסרה שאלה או מזהה שנתון" });
    }

    // 1. בדיקת מעבדות (Heuristic מהיר)
    if (isLabQuestion(question)) {
      return askLabs(req, res);
    }

    // 2. שליפת כל הקורסים מה-DB (הזזנו להתחלה כדי שנוכל להשוות מול הרגש)
    const coursesRef = db.collection("yearbooks").doc(yearbookId).collection("requiredCourses");
    const semestersSnap = await coursesRef.get();
    
    let allCourses = [];
    const coursePromises = semestersSnap.docs.map(sem => sem.ref.collection("courses").get());
    const coursesSnaps = await Promise.all(coursePromises);
    
    coursesSnaps.forEach(snap => {
      snap.forEach(doc => {
        const data = doc.data();
        allCourses.push({
          courseCode: String(data.courseCode),
          courseName: String(data.courseName)
        });
      });
    });

    const nameIndex = new Map();
    allCourses.forEach(c => {
      nameIndex.set(normalizeHebrew(c.courseName), c);
      nameIndex.set(normalizeHebrew(c.courseCode), c);
    });

    // 3. זיהוי רגש וסיווג כוונה במקביל
    const [emotion, classification] = await Promise.all([
      detectEmotion(question),
      classifyQuestion(question)
    ]);

    // 4. ניסיון חילוץ קורסים מתוך הסיווג של Gemini
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
export default router;