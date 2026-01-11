import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "http://localhost:5000";
const TRACKS = ["מולקולרית-תרופתית", "מזון והסביבה"];
const HEB_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת"];

const SECRETARY_PHONE = "04-9901927";
const SECRETARY_EMAIL = "nataliav@braude.ac.il";
const EXCEPTION_FORM_URL = `${API_BASE}/files/טופס_רישום_או_ביטול_קורס.doc`;
const ADVISOR_FORM_URL = `${API_BASE}/files/טופס_ייעוץ_לסטודנט.docx`;

export default function ChatBot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState({
    yearbook: null,
    semesterNum: null,
    semesterKey: null,
    topic: null,
    lastNameLetter: null,
    track: null,
  });

  const chatRef = useRef(null);
  const [yearbooks, setYearbooks] = useState([]);

  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    startChat();
    loadYearbooks();
  }, []);

  const addBot = (html) => setMessages((p) => [...p, { id: crypto.randomUUID(), sender: "bot", html }]);
  const addUser = (text) => setMessages((p) => [...p, { id: crypto.randomUUID(), sender: "user", html: text }]);

  const startChat = () => {
    setMessages([]);
    setContext({ yearbook: null, semesterNum: null, semesterKey: null, topic: null, lastNameLetter: null, track: null });
    addBot(`
      <div class="space-y-2">
        <div class="text-xl font-bold text-[#162A5A]">👋 ברוכים הבאים ל-BIO BOT</div>
        <p class="text-gray-700">אני כאן כדי לעזור לך עם מידע אקדמי, קורסים וייעוץ במחלקה.</p>
        <div class="text-sm font-semibold text-blue-600 mt-4 font-sans">אנא בחר באיזה שנת לימודים התחלת כדי לעזור לך
    `);
  };

  const loadYearbooks = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/yearbooks`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.yearbooks)) setYearbooks(data.yearbooks);
    } catch (e) {
      addBot("<div class='text-red-500 font-sans'>⚠️ תקלה בחיבור לשרת הנתונים.</div>");
    }
  };

  const sendMessage = async () => {
    const q = input.trim();
    if (!q) return;
    if (!context.yearbook) {
      addBot(`<div class="text-amber-600 font-medium italic font-sans">⚠️ יש לבחור שנתון מהרשימה לפני שניתן לשאול שאלות.</div>`);
      return;
    }
    addUser(q);
    setInput("");
    const loadingId = crypto.randomUUID();
    setMessages((p) => [...p, { id: loadingId, sender: "bot", html: "⏳ רגע אני חושב…"  }]);

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearbookId: context.yearbook, question: q }),
      });
      const data = await res.json();
      setMessages((p) => p.filter((m) => m.id !== loadingId));
      addBot(data.html || "לא נמצאה תשובה בבסיס הנתונים.");
    } catch (e) {
      setMessages((p) => p.filter((m) => m.id !== loadingId));
      addBot("<div class='font-sans'>⚠️ שגיאת שרת.</div>");
    }
  };

  const chooseYearbook = (y) => {
    addUser(y.label);
    setContext((p) => ({ ...p, yearbook: y.id }));
  };

  const chooseTopic = (t) => {
    const labels = { courses: "📚 קורסי חובה", advisor: "👨‍🏫 יועץ אקדמי", exceptional: "📝 רישום חריג" };
    addUser(labels[t]);
    if (t === "exceptional") {
      showExceptionalRegistration();
    } else {
      setContext((p) => ({ ...p, topic: t }));
      addBot("<b class='font-sans'>בחר/י סמסטר:</b>");
    }
  };

  const chooseSemester = (n) => {
    addUser(`סמסטר ${n}`);
    const updated = { ...context, semesterNum: n, semesterKey: `semester_${n}` };
    setContext(updated);
    if (context.topic === "courses") loadRequiredCourses(updated.yearbook, n);
    else if (context.topic === "advisor") {
      addBot("<b class='font-sans'>מה האות הראשונה של שם המשפחה?</b>");
      setContext((p) => ({ ...p, topic: "advisor_input", semesterNum: n }));
    }
  };

  const loadRequiredCourses = async (yb, sem) => {
  addBot("<div class='font-sans'>🔄 שולף נתונים מהשנתון...</div>");
  try {
    const res = await fetch(`${API_BASE}/api/requiredcourses/${yb}/semester_${sem}`);
    const data = await res.json();
    if (!res.ok || !data.courses?.length) return addBot("<div class='font-sans'>❌ לא נמצאו קורסים.</div>");
    
    let html = `<div class='space-y-4 font-sans'><div class='text-lg font-bold text-[#162A5A]'>סמסטר ${sem} - קורסי חובה</div>`;
    
    data.courses.forEach((c) => {
      html += `
        <div class='bg-white border-r-4 border-[#162A5A] p-4 rounded-lg shadow-sm border border-gray-100'>
          <div class='font-bold text-gray-900'>${c.courseName}</div>
          <div class='text-xs text-gray-500 font-mono mt-1'>${c.courseCode} | ${c.credits} נ״ז</div>
          ${c.relations?.length ? `
            <div class='mt-2 text-xs'>
              ${c.relations.map(r => `
                <div class='${r.type === 'PREREQUISITE' ? 'text-red-600' : 'text-yellow-500'} italic font-bold'>
                  • ${r.type === 'PREREQUISITE' ? 'קדם' : 'צמוד'}: ${r.courseName}
                </div>
              `).join('')}
            </div>` : ''}
        </div>`;
    });
    addBot(html + "</div>");
  } catch (e) { addBot("<div class='font-sans'>⚠️ שגיאה.</div>"); }
};

  const chooseLetter = (L) => {
    addUser(L);
    if (context.semesterNum >= 5) {
      setContext(p => ({ ...p, lastNameLetter: L, topic: "track_input" }));
      addBot("<b class='font-sans'>בחרי התמחות:</b>");
    } else {
      loadAdvisor(L, context.semesterNum, null);
    }
  };

  const loadAdvisor = async (letter, sem, track) => {
    // מנקים את ה-topic מיד כדי שהמקלדת תיעלם בזמן הטעינה או מיד אחריה
    setContext(p => ({ ...p, topic: "advisor" }));
    
    try {
      const params = new URLSearchParams({ lastNameLetter: letter, semester: String(sem) });
      if (track) params.set("track", track);
      
      const res = await fetch(`${API_BASE}/api/advisor?${params}`);
      const data = await res.json();
      const a = data.advisors?.[0];
      
      if (a) {
        addBot(`
          <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2 font-sans">
            <div class="font-bold text-[#162A5A]">👨‍🏫 היועץ האקדמי שלך:</div>
            <div class="text-sm"><b>שם:</b> ${a.name}</div>
            <div class="text-sm"><b>מייל:</b> <a href="mailto:${a.email}" class="text-blue-600 underline">${a.email}</a></div>
            <div class="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-blue-50">זכור למלא <a href="${ADVISOR_FORM_URL}" class="underline font-bold">טופס ייעוץ</a> לפני הפנייה.</div>
          </div>
        `);
      } else {
        addBot("<div class='font-sans text-red-500'>❌ לא נמצא יועץ מתאים לאות זו.</div>");
      }
    } catch (e) { 
      addBot("<div class='font-sans'>⚠️ שגיאה בחיבור לשרת.</div>"); 
    }
  };

  const showExceptionalRegistration = () => {
    addBot(`
      <div class="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div class="text-lg font-bold text-blue-700">📝 רישום או ביטול חריג לקורסים</div>

        <div class="text-sm text-gray-800">
          משתמשים ברישום חריג כאשר <strong>לא ניתן להירשם לקורס דרך תחנת מידע</strong>.
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm space-y-1">
          <div class="font-semibold mb-1">מתי זה קורה בדרך כלל?</div>
          <div>❌ אין מקום פנוי בקורס</div>
          <div>📉 נכשלת בקורס פעמיים</div>
          <div>⏰ מועד הרישום/הביטול הסתיים</div>
        </div>

        <div class="border rounded-xl p-3 text-sm space-y-2">
          <div class="font-semibold mb-1">מה עושים?</div>

          <div class="flex flex-row-reverse items-start gap-2">
            <span class="shrink-0">1️⃣</span><span>מורידים את הטופס</span>
          </div>

          <div class="flex flex-row-reverse items-start gap-2">
            <span class="shrink-0">2️⃣</span><span>ממלאים פרטי קורס והסיבה לבקשה</span>
          </div>

          <div class="flex flex-row-reverse items-start gap-2">
            <span class="shrink-0">3️⃣</span>
            <span>פונים ליועץ האקדמי לקבלת חתימה <span class="text-gray-600">(מידע על היועץ נמצא ב“יועץ אקדמי”)</span></span>
          </div>

          <div class="flex flex-row-reverse items-start gap-2">
            <span class="shrink-0">4️⃣</span><span>שולחים את הטופס החתום למזכירות המחלקה</span>
          </div>
        </div>

        <div class="border-t pt-3 text-sm space-y-2">
          <div>
            📄 <strong>טופס רישום/ביטול קורס:</strong><br/>
            👉 <a href="${EXCEPTION_FORM_URL}" class="underline text-blue-700" target="_blank" rel="noreferrer">
              להורדת הטופס
            </a>
          </div>

          <div class="text-gray-700">
            📞 <strong>מזכירות:</strong> ${SECRETARY_PHONE}<br/>
            ✉️ <strong>מייל:</strong>
            <a class="underline text-blue-700" href="mailto:${SECRETARY_EMAIL}">
              ${SECRETARY_EMAIL}
            </a>
          </div>
        </div>
      </div>
    `);
  };

  const pillBtn = "px-4 py-2 rounded-full border border-blue-500 bg-white text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm active:scale-95 font-sans";
  const letterBtn = "w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-[#162A5A] hover:text-[#162A5A] transition-all text-sm font-bold font-sans shadow-sm";

  return (
    <div className="w-full max-w-6xl mx-auto h-[85vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden font-sans" dir="rtl">
      
      {/* Header */}
        <div className="bg-[#162A5A] text-white px-8 py-5 flex flex-row-reverse items-center justify-between shadow-md z-10">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-bold text-lg leading-none tracking-tight text-left">BIO BOT</h1>
            </div>
            <div className="w-10 h-10 rounded-full bg-white text-[#162A5A] flex items-center justify-center font-black text-xl shadow-inner">B</div>
          </div>
          
          <button 
            onClick={startChat} 
            className="text-xs bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition-all border border-white/20 font-sans flex items-center gap-2"
          >
            <span>איפוס שיחה</span>
            <span className="text-sm">↺</span>
          </button>
        </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={chatRef} className="flex-1 overflow-y-auto p-8 bg-[#F8FAFC] space-y-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "user" ? "justify-start" : "justify-end"}`}>
              <div 
                className={`max-w-[75%] px-6 py-4 rounded-2xl shadow-sm leading-relaxed ${
                  m.sender === "user" 
                    ? "bg-[#3B82F6] text-white rounded-tl-none shadow-blue-100 font-sans" 
                    : "bg-white border border-gray-200 text-gray-800 rounded-tr-none shadow-gray-100 font-sans"
                }`}
                dangerouslySetInnerHTML={{ __html: m.html }} 
              />
            </div>
          ))}

          {/* Quick Actions (Pills) - Aligned to Bot side (Right in RTL) */}
          <div className="pt-4 flex flex-col gap-4 items-end">
            {!context.yearbook && (
              <div className="flex flex-wrap gap-2 justify-end">
                {yearbooks.map((y) => (
                  <button key={y.id} className={pillBtn} onClick={() => chooseYearbook(y)}>{y.label}</button>
                ))}
              </div>
            )}

            {context.yearbook && !context.topic && (
            <div className="flex flex-col items-end gap-3 w-full">
              <div className="flex items-center gap-2 mb-1 text-[#162A5A] font-bold text-lg px-1 animate-in fade-in slide-in-from-right-2 duration-300">
                <span>  אפשר לבחור נושא כמו 👇</span>
              </div>
              
              <div className="flex flex-wrap gap-3 justify-end">
                <button className={pillBtn} onClick={() => chooseTopic("courses")}>
                  📚 קורסי חובה
                </button>
                <button className={pillBtn} onClick={() => chooseTopic("advisor")}>
                  👨‍🏫 יועץ אקדמי
                </button>
                <button className={pillBtn} onClick={() => chooseTopic("exceptional")}>
                  📝 רישום חריג
                </button>
              </div>
            </div>
          )}
            {context.topic && !context.semesterNum && (context.topic === "courses" || context.topic === "advisor") && (
              <div className="flex flex-wrap gap-2 justify-end">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button key={n} className={pillBtn} onClick={() => chooseSemester(n)}>סמסטר {n}</button>
                ))}
              </div>
            )}

            {context.topic === "advisor_input" && (
              <div className="grid grid-cols-7 gap-2 max-w-md bg-white p-5 rounded-2xl shadow-lg border border-gray-100 animate-in fade-in zoom-in duration-200">
                {HEB_LETTERS.map((L) => (
                  <button key={L} className={letterBtn} onClick={() => chooseLetter(L)}>{L}</button>
                ))}
              </div>
            )}

            {context.topic === "track_input" && (
              <div className="flex flex-wrap gap-3 justify-end">
                {TRACKS.map((t) => (
                  <button key={t} className={pillBtn} onClick={() => { addUser(t); loadAdvisor(context.lastNameLetter, context.semesterNum, t); }}>{t}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Navigation & Input */}
      <div className="p-6 bg-white border-t border-gray-100 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-3">
            {context.topic && (
                <div className="flex gap-4 px-2">
                    <button className="text-[11px] font-bold text-blue-600 hover:underline uppercase tracking-wider font-sans" onClick={() => setContext(p => ({...p, topic: null, semesterNum: null}))}>← החלפת נושא</button>
                    <button className="text-[11px] font-bold text-gray-400 hover:underline uppercase tracking-wider font-sans" onClick={() => setContext(p => ({...p, semesterNum: null}))}>← שינוי סמסטר</button>
                </div>
            )}
            
            <div className="flex gap-4 items-center">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="הקליד/י שאלה חופשית כאן..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[#162A5A] focus:bg-white transition-all outline-none pr-14 shadow-inner font-sans"
                    />
                    <button
                        onClick={sendMessage}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-[#162A5A] text-white p-2.5 rounded-xl hover:bg-blue-900 transition-all shadow-lg active:scale-95"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}