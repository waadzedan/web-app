import fetch from "node-fetch";
import { db } from "../../server.js";

const MODEL = "gemini-2.5-flash";

/* ================= helpers ================= */

const normalize = (s = "") =>
  String(s)
    .replace(/["׳״'`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-–—]/g, "")
    .toLowerCase()
    .trim();

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/g, "").trim();
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

/* ---------- date parsing ---------- */
function parseLabDate(dateStr) {
  if (!dateStr) return null;

  const clean = String(dateStr)
    .replace(/^[א-ת]'\s*/, "") // א' 9.11.25
    .replace(/^[א-ת]\s*/, "") // א 9.11.25
    .trim();

  // dd.mm.yy או dd.mm.yyyy
  let m = clean.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    let [, d, mth, y] = m;
    if (y.length === 2) y = "20" + y;
    return new Date(`${y}-${mth.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }

  // ISO fallback
  const iso = new Date(clean);
  if (!isNaN(iso)) return iso;

  return null;
}

/* ---------- time helpers ---------- */

function isToday(dateStr) {
  const d = parseLabDate(dateStr);
  if (!d) return false;
  return d.toDateString() === new Date().toDateString();
}

function isTomorrow(dateStr) {
  const d = parseLabDate(dateStr);
  if (!d) return false;
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}

function isThisCalendarWeek(dateStr) {
  const d = parseLabDate(dateStr);
  if (!d) return false;

  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return d >= start && d <= end;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function labDateTime(lab) {
  const d = parseLabDate(lab?.date);
  if (!d) return null;

  const mins = parseTimeToMinutes(lab?.time);
  if (mins != null) {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setMinutes(mins);
    return dt;
  }
  return d;
}

/* ================= Gemini ================= */

async function classifyLabQuestionWithGemini(question) {
  const prompt = `
החזירי JSON בלבד.
{
  "intent": "lab_query" | "next_lab",
  "course": string | null,
  "session": string | null,
  "time": "today" | "tomorrow" | "week" | "all"
}
חוקים:
- אם המשתמש מבקש "המעבדה הבאה" / "הקרובה" → intent="next_lab"

שאלה:
"${question}"
`;

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

/* ================= Firestore ================= */

async function getLatestYearId() {
  const snap = await db
    .collection("lab_schedule")
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function getSemestersDocs(yearId) {
  return db.collection("lab_schedule").doc(yearId).collection("semesters").get();
}

/* ================= BONUS RULES ================= */

/**
 * מביא את כל שמות הקורסים מהשנה האחרונה כדי לאפשר זיהוי קורס בלי AI
 */
async function getAllCourseNamesForYear(yearId) {
  const semSnap = await getSemestersDocs(yearId);
  const out = [];

  for (const sem of semSnap.docs) {
    const courses = sem.data().courses || {};
    for (const c of Object.values(courses)) {
      if (c?.courseName) out.push(c.courseName);
    }
  }

  // ייחודי
  return Array.from(new Set(out));
}

/**
 * זיהוי מהיר לפי חוקים:
 * - time: היום/מחר/השבוע
 * - intent: "המעבדה הבאה/הקרובה"
 * - session: "מעבדה 2" / "מפגש 3" / "session 1"
 * - course: מתוך רשימת הקורסים (substring match)
 *
 * מחזיר null אם לא בטוחים מספיק.
 */
function preClassifyByRules(question, allCourseNames = []) {
  const q = String(question || "").trim();
  if (!q) return null;

  const qn = normalize(q);

  // intent
  const isNext =
    qn.includes("המעבדה הבאה") ||
    qn.includes("מעבדה הבאה") ||
    qn.includes("הקרובה") ||
    qn.includes("הבא") ||
    qn.includes("next lab");

  // time
  let time = "all";
  if (qn.includes("היום") || qn.includes("today")) time = "today";
  else if (qn.includes("מחר") || qn.includes("tomorrow")) time = "tomorrow";
  else if (qn.includes("השבוע") || qn.includes("week")) time = "week";

  // session
  let session = null;
  // מעבדה 2 / מפגש 2 / session 2
  const sm = q.match(/(?:מעבדה|מפגש|session)\s*([0-9]+)/i);
  if (sm) session = String(sm[1]);

  // course (מתוך רשימה) – מחפשים התאמה הכי ארוכה
  let course = null;
  if (allCourseNames.length) {
    const matches = allCourseNames
      .map((name) => {
        const nn = normalize(name);
        // substring match (שני כיוונים כדי לתפוס “כימיה כללית” מול “כימיה כללית ואנליטית”)
        const hit = qn.includes(nn) || nn.includes(qn);
        return hit ? { name, len: nn.length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.len - a.len);

    if (matches[0]) course = matches[0].name;
  }

  // החלטה: מתי אנחנו "מספיק בטוחים" כדי לא לקרוא לג'מיני?
  // - אם יש next → תמיד אפשר בלי AI
  // - או אם יש אחד מהבאים: time או session או course (לפחות אחד)
  const hasAnySignal = isNext || time !== "all" || !!session || !!course;
  if (!hasAnySignal) return null;

  return {
    intent: isNext ? "next_lab" : "lab_query",
    course: course || null,
    session: session || null,
    time,
  };
}

/* ================= MAIN ================= */

export default async function askLabs(req, res) {
  try {
    const { question } = req.body || {};
    if (!question) return res.json({ html: "❌ חסרה שאלה" });

    const yearId = await getLatestYearId();
    if (!yearId) return res.json({ html: "❌ לא נמצאה שנת לימודים פעילה" });

    const semSnap = await getSemestersDocs(yearId);
    if (semSnap.empty) {
      return res.json({ html: "❌ לא נמצאו סמסטרים לשנה הנוכחית" });
    }

    // ===== בונוס: Rules לפני Gemini =====
    const allCourseNames = await getAllCourseNamesForYear(yearId);
    let parsed = preClassifyByRules(question, allCourseNames);

    // אם rules לא הצליחו → נופלים ל-Gemini
    if (!parsed) {
      parsed = await classifyLabQuestionWithGemini(question);
    }

    if (!parsed || !["lab_query", "next_lab"].includes(parsed.intent)) {
      return res.json({ html: "❌ לא הצלחתי להבין את השאלה" });
    }

    const courseKey = normalize(parsed.course || "");

    // ===== איסוף מעבדות =====
    let labs = [];

    for (const sem of semSnap.docs) {
      const semesterData = sem.data();
      const courses = semesterData.courses || {};

      for (const course of Object.values(courses)) {
        if (parsed.course && !normalize(course.courseName).includes(courseKey)) continue;

        for (const lab of course.labs || []) {
          labs.push({
            semester: semesterData.semester,
            courseName: course.courseName,
            ...lab,
          });
        }
      }
    }

    // session filter
    if (parsed.session) {
      labs = labs.filter((l) => String(l.session) === String(parsed.session));
    }

    // time filter
    if (parsed.time === "today") {
      labs = labs.filter((l) => isToday(l.date));
    } else if (parsed.time === "tomorrow") {
      labs = labs.filter((l) => isTomorrow(l.date));
    } else if (parsed.time === "week") {
      labs = labs.filter((l) => isThisCalendarWeek(l.date));
    }

    // ===== intent: next_lab =====
    if (parsed.intent === "next_lab") {
      const now = new Date();
      const future = labs
        .map((l) => ({ ...l, _dt: labDateTime(l) }))
        .filter((l) => l._dt && l._dt >= now)
        .sort((a, b) => a._dt - b._dt);

      if (!future.length) {
        return res.json({ html: "ℹ️ לא נמצאה מעבדה עתידית לפי התנאים." });
      }

      const next = future[0];
      const staffStr = Array.isArray(next.staff) ? next.staff.join(", ") : next.staff || "-";

      const html = `
        <div class="border rounded-xl p-4 bg-gray-50">
          <div class="font-bold text-lg text-blue-700 mb-2">⏭️ המעבדה הבאה</div>
          <div class="font-medium">📘 ${next.courseName} <span class="text-sm text-gray-500">(סמסטר ${next.semester ?? "-"})</span></div>
          <div class="text-sm mt-2">🧪 ${next.session ? `מעבדה ${next.session}` : "מעבדה"}</div>
          <div class="text-sm mt-1">📅 ${next.day || ""} ${next.date || "-"} | ⏰ ${next.time || "-"}</div>
          <div class="text-sm mt-1">👥 קבוצה: ${next.group || "-"}</div>
          <div class="text-sm mt-1">👩‍🏫 מרצה: ${staffStr}</div>
        </div>
      `;
      return res.json({ html: `<div class="text-sm">${html}</div>` });
    }

    if (!labs.length) {
      return res.json({ html: "ℹ️ לא נמצאו מעבדות מתאימות לפי השאלה." });
    }

    // מיון רגיל לפי תאריך/שעה
    labs = labs
      .map((l) => ({ ...l, _dt: labDateTime(l) }))
      .sort((a, b) => {
        if (!a._dt && !b._dt) return 0;
        if (!a._dt) return 1;
        if (!b._dt) return -1;
        return a._dt - b._dt;
      });

    // קיבוץ לפי קורס + סמסטר
    const grouped = {};
    for (const l of labs) {
      const key = `${l.courseName}__${l.semester ?? "-"}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(l);
    }

    const html = Object.entries(grouped)
      .map(([key, items]) => {
        const [courseName, semester] = key.split("__");

        return `
          <div class="mb-6">
            <div class="font-bold text-lg text-blue-700 mb-2">
              📘 ${courseName}
              <span class="text-sm text-gray-500">(סמסטר ${semester})</span>
            </div>

            <ul class="space-y-3">
              ${items
                .map((l) => {
                  const staffStr = Array.isArray(l.staff) ? l.staff.join(", ") : l.staff || "-";
                  return `
                    <li class="border rounded-lg p-3 bg-gray-50">
                      <div class="font-medium">
                        🧪 ${l.session ? `מעבדה ${l.session}` : "מעבדה"}
                      </div>

                      <div class="text-sm mt-1">
                        📅 ${l.day || ""} ${l.date || "-"} | ⏰ ${l.time || "-"}
                      </div>

                      <div class="text-sm mt-1">
                        👥 קבוצה: ${l.group || "-"}
                      </div>

                      <div class="text-sm mt-1">
                        👩‍🏫 מרצה: ${staffStr}
                      </div>
                    </li>
                  `;
                })
                .join("")}
            </ul>
          </div>
        `;
      })
      .join("");

    return res.json({ html: `<div class="text-sm">${html}</div>` });
  } catch (err) {
    console.error("ASK LABS ERROR:", err);
    return res.status(500).json({ html: "⚠️ שגיאה בעיבוד שאלה על מעבדות" });
  }
}