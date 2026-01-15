import fetch from "node-fetch";
import { db } from "../../server.js";

const MODEL = "gemini-2.5-flash";

/* =============================
   Utils
============================= */
export const normalizeHebrew = (s = "") =>
  String(s)
    .replace(/["׳״'`]/g, "")
    .replace(/[.-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ייע/g, "יע")
    .replace(/יי/g, "י")
    .toLowerCase()
    .trim();

/* =============================
   Detection
============================= */
export function isRegistrationQuestion(question = "") {
  const q = normalizeHebrew(question);
  return [
    "רישום","הרשמה","חלון","מתי",
    "יועץ","יועצת","יעוץ","ייעוץ",
    "פטור","חריג","נז","165",
    "קישור","הדרכה",
    "למי פונים",
    "מעבדה","מעבדות",
    "מנטור","מלווה",
    "סטודנטים חדשים",
    "סטאז","סטאז׳","התמחות"
  ].some(w => q.includes(w));
}

export function extractSemesterNumber(question = "") {
  const s = String(question);
  let m = s.match(/סמסטר\s*([1-8])/);
  if (m) return Number(m[1]);
  m = s.match(/סמ\s*([1-8])/);
  if (m) return Number(m[1]);
  return null;
}

/* =============================
   Gemini – intent
============================= */
export async function classifyRegistrationIntent(question) {
  const prompt = `
את מערכת שמסווגת שאלות על הנחיות רישום.

החזירי JSON בלבד:
{
  "intent": "window" | "advisors" | "labs" | "links" | "credits"
          | "exemptions" | "contacts" | "mentors"
          | "internship" | "rules" | "general"
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
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    });

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

/* =============================
   Intent refinement
============================= */
export function refineRegistrationIntent(intent, question) {
  const q = normalizeHebrew(question);

  if (
    q.includes("סטודנט חדש") ||
    q.includes("סטודנטים חדשים") ||
    q.includes("מלווה")
  ) return "mentors";

  if (q.includes("סטאז")) return "internship";
  if (q.includes("מעבדה")) return "labs";
  if (q.includes("יועץ")) return "advisors";
  if (q.includes("פטור") || q.includes("חריג")) return "exemptions";
  if (q.includes("קישור") || q.includes("הדרכה")) return "links";
  if (q.includes("נז") || q.includes("165")) return "credits";
  if (q.includes("מתי") || q.includes("חלון")) return "window";
  if (q.includes("למי פונים") || q.includes("בעיה")) return "contacts";

  return intent || "general";
}

/* =============================
   Firestore
============================= */
export async function getRegDoc(semester) {
  const snap = await db
    .collection("registrationGuidelines")
    .doc(`semester_${semester}`)
    .get();
  return snap.exists ? snap.data() : null;
}

export async function getAllRegDocs() {
  const snap = await db.collection("registrationGuidelines").get();
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => a.semesterNumber - b.semesterNumber);
}

/* =============================
   Builders – single semester
============================= */
export function buildRegistrationAnswer(intent, doc) {
  const sem = doc.semesterNumber;
  const cohort = doc.audience?.cohortText
    ? ` (${doc.audience.cohortText})`
    : "";

  /* ---------- LINKS ---------- */
  if (intent === "links") {
    const links = doc.links || [];
    if (links.length) {
      return `
        <div class="text-sm">
          <b>הדרכות רישום – סמסטר ${sem}${cohort}</b><br/><br/>
          ${links.map(l =>
            `• <a href="${l.url}" target="_blank">${l.label}</a>`
          ).join("<br/>")}
        </div>`;
    }

    const rules = (doc.keyRules || [])
      .filter(r => r.text.includes("רישום") || r.text.includes("דמו"))
      .map(r => `• ${r.text}`)
      .join("<br/>");

    return `
      <div class="text-sm">
        <b>הנחיות רישום – סמסטר ${sem}</b><br/><br/>
        ${rules || "הרישום מתבצע דרך אתר המכללה."}
      </div>`;
  }

  /* ---------- WINDOW ---------- */
  if (intent === "window") {
    const w = doc.registrationWindow;
    return `
      <div class="text-sm">
        ⏰ <b>חלון הרישום – סמסטר ${sem}${cohort}</b><br/>
        ${w.date} בין ${w.from} ל-${w.to}
      </div>`;
  }

  /* ---------- ADVISORS ---------- */
 if (intent === "advisors") {
  const a = doc.contacts?.academicAdvisors || [];
  return `
    <div class="text-sm">
      <b>יועצים אקדמיים – סמסטר ${sem}</b><br/><br/>

      ${a.map(x =>
        `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
      ).join("<br/>")}

      <hr style="margin:12px 0; border:none; border-top:1px solid #e5e7eb;" />

      <div style="font-size:12px; color:#6b7280; text-align:center;">
        ניתן למצוא את היועץ/ת האקדמי/ת שלך גם דרך התפריט למטה ⬇️
      </div>
    </div>`;
}

  /* ---------- LABS ---------- */
  if (intent === "labs") {
    const labs = doc.contacts?.labs || [];
    if (!labs.length)
      return `<div class="text-sm">ℹ️ אין אחראי/ת מעבדות בסמסטר ${sem}.</div>`;
    return `
      <div class="text-sm">
        <b>אחראי/ת מעבדות – סמסטר ${sem}</b><br/><br/>
        ${labs.map(l =>
          `• ${l.name} – <a href="mailto:${l.email}">${l.email}</a>`
        ).join("<br/>")}
      </div>`;
  }

  /* ---------- MENTORS ---------- */
  if (intent === "mentors") {
    const m = doc.contacts?.mentors || [];
    if (!m.length)
      return `<div class="text-sm">ℹ️ אין סטודנט/ית מלווה בסמסטר ${sem}.</div>`;
    return `
      <div class="text-sm">
        <b>סטודנט/ית מלווה – סמסטר ${sem}</b><br/><br/>
        ${m.map(x =>
          `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
        ).join("<br/>")}
      </div>`;
  }

  /* ---------- EXEMPTIONS ---------- */
  if (intent === "exemptions") {
    const e = doc.contacts?.exemptions || [];
    if (!e.length)
      return `<div class="text-sm">ℹ️ אין מידע על פטורים בסמסטר זה.</div>`;
    return `
      <div class="text-sm">
        <b>פטורים / חריגים</b><br/><br/>
        ${e.map(x =>
          `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
        ).join("<br/>")}
      </div>`;
  }

  /* ---------- INTERNSHIP ---------- */
  if (intent === "internship") {
    const rules = (doc.keyRules || [])
      .filter(r => r.code?.includes("INTERNSHIP"))
      .map(r => `• ${r.text}`)
      .join("<br/>");

    return `
      <div class="text-sm">
        <b>סטאז' / התמחות – סמסטר ${sem}</b><br/><br/>
        ${rules || "מידע על סטאז' מתפרסם לפי סמסטר ובהנחיות המחלקה."}
      </div>`;
  }

  /* ---------- CREDITS ---------- */
  if (intent === "credits") {
    return `
      <div class="text-sm">
        <b>נקודות זכות</b><br/>
        ${doc.audience?.creditsRuleText || "נדרש מינימום 165 נ״ז"}
      </div>`;
  }

  /* ---------- CONTACTS ---------- */
  if (intent === "contacts") {
    const c = doc.contacts?.registrationSupport || [];
    if (!c.length)
      return `<div class="text-sm">ℹ️ אין איש קשר ייעודי לרישום בסמסטר זה.</div>`;
    return `
      <div class="text-sm">
        <b>אנשי קשר לרישום</b><br/><br/>
        ${c.map(x =>
          `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
        ).join("<br/>")}
      </div>`;
  }

  return `<div class="text-sm">${doc.title}</div>`;
}

/* =============================
   Builders – ALL semesters
============================= */
export function buildAllAdvisorsAnswer(docs) {
  return `
    <div class="text-sm">
      <b>יועצים אקדמיים לפי סמסטר</b><br/><br/>
      ${docs.map(d => {
        const a = d.contacts?.academicAdvisors || [];
        if (!a.length) return "";
        return `<b>סמסטר ${d.semesterNumber}</b><br/>` +
          a.map(x =>
            `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
          ).join("<br/>");
      }).join("<br/><br/>")}
    </div>`;
}

export function buildAllLabsAnswer(docs) {
  return `
    <div class="text-sm">
      <b>אחראי/ת מעבדות לפי סמסטר</b><br/><br/>
      ${docs.map(d => {
        const l = d.contacts?.labs || [];
        if (!l.length) return "";
        return `<b>סמסטר ${d.semesterNumber}</b><br/>` +
          l.map(x =>
            `• ${x.name} – <a href="mailto:${x.email}">${x.email}</a>`
          ).join("<br/>");
      }).join("<br/><br/>")}
    </div>`;
}



