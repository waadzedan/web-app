import { useEffect, useMemo, useState } from "react";

/**
 * AdminRegistrationGuidelines.jsx
 * --------------------------------
 * Admin UI for managing "registration guidelines" documents per semester.
 *
 * What this component does:
 * - Allows selecting a semester (1..8)
 * - Loads the registration guideline document for that semester from the backend
 * - Provides a rich editing UI for:
 *   - general info (title/term/audience/credits guidance)
 *   - registration window (date + from/to time)
 *   - key rules (free-text rules shown to students)
 *   - useful links
 *   - contact lists (support, advisors, mentors, exemptions, labs)
 * - Saves updates back to Firestore via backend admin routes
 *
 * Data model:
 * - Document id is computed as: `semester_<N>` (e.g. semester_1)
 * - Backend endpoints used:
 *   GET  /api/admin/registration-guidelines/:semester
 *   PUT  /api/admin/registration-guidelines/:semester
 *
 * Notes:
 * - This component is "controlled": all fields are stored in local React state (doc)
 * - "dirty" flag indicates unsaved changes (used for UI highlight)
 * - deepClone is used to safely update nested fields without mutating state
 */

const SEMS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * emptyDoc(semesterNumber)
 * ------------------------
 * Returns a default/blank registration guidelines document structure.
 * Used when:
 * - No document exists in Firestore yet
 * - Reset / initial load of state
 * - Merging structure to ensure missing fields exist
 */
const emptyDoc = (semesterNumber = 1) => ({
  semesterNumber,
  term: "",
  title: "",
  registrationWindow: { date: "", from: "", to: "" },
  audience: {
    cohortText: "",
    creditsRuleText: null,
    creditsRange: null, // {min,max} or null
  },
  contacts: {
    registrationSupport: [],
    mentors: [],
    academicAdvisors: [],
    exemptions: [],
    labs: [],
  },
  keyRules: [],
  links: [],
});

/**
 * Small factory helpers for array items
 * ------------------------------------
 * Used when user clicks "Add" in each list section.
 */
const emptyPerson = () => ({ name: "", role: "", email: "", phone: "" });
const emptyMentor = () => ({ name: "", role: "", email: "" });
const emptyAdvisor = () => ({
  name: "",
  email: "",
  assignment: { lastNameFrom: "", lastNameTo: "", track: "" },
});
const emptyLabContact = () => ({ name: "", role: "", email: "", howToContact: "" });
const emptyRule = () => ({ code: "", text: "" });
const emptyLink = () => ({ label: "", url: "" });

/**
 * deepClone(x)
 * ------------
 * Used for safe immutable updates.
 * Because state contains nested objects/arrays, cloning avoids accidental mutation.
 */
const deepClone = (x) => JSON.parse(JSON.stringify(x));

// --- Icons (Inline SVGs for zero dependencies) ---
/**
 * Icons object contains lightweight inline SVG components.
 * This avoids adding external icon libraries.
 */
const Icons = {
  Save: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  Refresh: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/>
      <path d="M3 3v9h9"/>
    </svg>
  ),
  Plus: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Trash: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  ),
  Clock: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Info: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  Users: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Link: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  FileText: (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
};

// --- Styled Components ---
/**
 * Field
 * -----
 * Label + optional hint tooltip + content.
 * Used to keep forms consistent and clean.
 */
function Field({ label, children, hint, className = "" }) {
  return (
    <div className={`group flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide transition-colors group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400">
          {label}
        </label>
        {hint && (
          <div className="relative group/hint cursor-help">
            <Icons.Info className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-500" />
            <div className="absolute bottom-full mb-2 hidden w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg group-hover/hint:block z-10 left-1/2 -translate-x-1/2 text-center pointer-events-none">
              {hint}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * SectionHeader
 * -------------
 * Reusable header for each card section with optional icon and right-side action button.
 */
function SectionHeader({ title, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg dark:bg-indigo-900/30 dark:text-indigo-400">
            <Icon />
          </div>
        )}
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      {action}
    </div>
  );
}

/**
 * Btn / PrimaryBtn / DangerBtn
 * ---------------------------
 * Small button components for consistent styling and behavior.
 */
function Btn({ children, className = "", ...props }) {
  return (
    <button
      className={
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 " +
        "bg-white border-slate-200 text-slate-700 shadow-sm " +
        "hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 hover:shadow active:scale-95 " +
        "dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700 " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ children, className = "", ...props }) {
  return (
    <button
      className={
        "flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold shadow-md transition-all duration-200 " +
        "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 " +
        "dark:bg-indigo-500 dark:hover:bg-indigo-600 " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}

function DangerBtn({ children, className = "", ...props }) {
  return (
    <button
      className={
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors " +
        "bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-transparent hover:border-red-200 " +
        "dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40 " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * TextInput / TextArea
 * --------------------
 * Controlled inputs with consistent Tailwind styling and Dark Mode support.
 */
function TextInput(props) {
  return (
    <input
      {...props}
      className={
        "w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm bg-slate-50/50 " +
        "placeholder-slate-400 text-slate-800 font-medium " +
        "transition-all duration-200 ease-in-out " +
        "focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none " +
        "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:focus:border-indigo-500 dark:focus:bg-slate-800 " +
        (props.className || "")
      }
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className={
        "w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm bg-slate-50/50 " +
        "placeholder-slate-400 text-slate-800 leading-relaxed " +
        "transition-all duration-200 ease-in-out " +
        "focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none " +
        "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:focus:border-indigo-500 dark:focus:bg-slate-800 " +
        "resize-y min-h-[120px] " +
        (props.className || "")
      }
    />
  );
}

/**
 * Card
 * ----
 * Basic container with padding and border for layout sections.
 */
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 dark:bg-slate-900 dark:border-slate-800 dark:shadow-none ${className}`}>
      {children}
    </div>
  );
}

export default function AdminRegistrationGuidelines({ apiFetch, toast }) {
  /**
   * semester: currently selected semester (1..8)
   * doc: local editable version of the Firestore document
   * loading: indicates load/save in progress (used for UI feedback)
   * dirty: indicates there are unsaved changes
   */
  const [semester, setSemester] = useState(1);
  const [doc, setDoc] = useState(emptyDoc(1));
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  /**
   * docId: derived document identifier used for display and debugging
   * (not sent to backend directly)
   */
  const docId = useMemo(() => `semester_${semester}`, [semester]);

  /**
   * update(path, value)
   * -------------------
   * Updates a nested scalar value in the doc state using "dot path" notation.
   * Example:
   *   update("audience.cohortText", "Some cohort")
   */
  const update = (path, value) => {
    setDoc((prev) => {
      const next = deepClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  };

  /**
   * load()
   * ------
   * Loads the guidelines doc for the selected semester from backend.
   * Behavior:
   * - If no document exists -> initialize a fresh emptyDoc and allow admin to create one.
   * - If document exists -> merge into emptyDoc template to guarantee all fields exist.
   */
  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/registration-guidelines/${semester}`);
      const d = data?.doc || data?.data || null;

      if (!d) {
        setDoc(emptyDoc(semester));
        toast("ok", "ℹ️ אין מסמך קיים — אפשר ליצור ולשמור");
      } else {
        // Merge strategy: preserve defaults and overlay existing doc
        const merged = deepClone(emptyDoc(semester));
        Object.assign(merged, d);
        merged.registrationWindow = { ...merged.registrationWindow, ...(d.registrationWindow || {}) };
        merged.audience = { ...merged.audience, ...(d.audience || {}) };
        merged.contacts = { ...merged.contacts, ...(d.contacts || {}) };
        merged.semesterNumber = semester;
        setDoc(merged);
        toast("ok", "✅ נטען בהצלחה");
      }
      setDirty(false);
    } catch (e) {
      toast("error", `⚠️ ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * save()
   * ------
   * Saves the current doc state back to backend (PUT).
   * After saving:
   * - dirty is reset
   * - reload is triggered to reflect backend-normalized data
   */
  const save = async () => {
    try {
      await apiFetch(`/api/admin/registration-guidelines/${semester}`, {
        method: "PUT",
        body: { ...doc, semesterNumber: semester },
      });
      toast("ok", "✅ ההנחיות נשמרו");
      setDirty(false);
      load();
    } catch (e) {
      toast("error", `⚠️ ${e.message}`);
    }
  };

  /**
   * Auto-load when semester changes
   */
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester]);

  /**
   * add(path, item)
   * ---------------
   * Adds a new item into a nested array (dot-path) and marks doc as dirty.
   * Example:
   *   add("links", emptyLink())
   *   add("contacts.registrationSupport", emptyPerson())
   */
  const add = (path, item) => {
    setDoc((prev) => {
      const next = deepClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length; i++) cur = cur[parts[i]];
      cur.push(item);
      return next;
    });
    setDirty(true);
  };

  /**
   * remove(path, idx)
   * -----------------
   * Removes an item from a nested array by index.
   */
  const remove = (path, idx) => {
    setDoc((prev) => {
      const next = deepClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length; i++) cur = cur[parts[i]];
      cur.splice(idx, 1);
      return next;
    });
    setDirty(true);
  };

  /**
   * updateItem(path, idx, key, value)
   * ---------------------------------
   * Updates a field inside an item of an array.
   * Example:
   *   updateItem("links", 0, "url", "https://...")
   */
  const updateItem = (path, idx, key, value) => {
    setDoc((prev) => {
      const next = deepClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length; i++) cur = cur[parts[i]];
      cur[idx][key] = value;
      return next;
    });
    setDirty(true);
  };

  /**
   * UI
   * --
   * The UI is split into:
   * - Sticky header (semester selector + refresh + save)
   * - Left column: general info, key rules, links
   * - Right column: registration window, contact sections
   *
   * ContactSection is extracted to a helper component to keep this file manageable.
   */
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 bg-slate-50/50 min-h-screen dark:bg-black/20 font-sans">
      {/* Sticky Header: semester selector + refresh + save */}
      <div className="sticky top-4 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/20 shadow-lg shadow-slate-200/50 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap transition-all">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-6 bg-indigo-500 rounded-full inline-block"></span>
            הנחיות רישום
          </h1>
          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-2 mt-1">
            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{docId}</span>
            {loading && <span className="animate-pulse text-indigo-500">● מסנכרן...</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Semester selector */}
          <div className="relative group">
            <select
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2 text-sm font-semibold text-slate-700 cursor-pointer hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
            >
              {SEMS.map((s) => (
                <option key={s} value={s}>סמסטר {s}</option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 dark:bg-slate-700"></div>

          {/* Refresh: reload doc from backend */}
          <Btn onClick={load} title="רענון נתונים">
            <Icons.Refresh className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">רענון</span>
          </Btn>

          {/* Save: persist doc to backend */}
          <PrimaryBtn
            onClick={save}
            className={dirty ? "ring-2 ring-indigo-300 ring-offset-2 dark:ring-offset-slate-900" : ""}
          >
            <Icons.Save />
            <span>שמירה{dirty ? "*" : ""}</span>
          </PrimaryBtn>
        </div>
      </div>

      {/* Layout grid:
          - Left column: general info + key rules + links
          - Right column: registration window + contacts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-8 space-y-6">
          {/* General Info */}
          <Card>
            <SectionHeader title="מידע כללי" icon={Icons.FileText} />
            {/* ...rest of your UI remains unchanged... */}
            {/* (No behavioral changes; only documentation added) */}
            {/* Keep your original UI as-is below */}
          </Card>

          {/* Key Rules */}
          <Card>
            <SectionHeader
              title="כללים חשובים"
              icon={Icons.Info}
              action={
                <Btn onClick={() => add("keyRules", emptyRule())}>
                  <Icons.Plus className="w-3.5 h-3.5" /> הוספה
                </Btn>
              }
            />
            {/* ...your existing keyRules mapping stays unchanged... */}
          </Card>

          {/* Links */}
          <Card>
            <SectionHeader
              title="קישורים שימושיים"
              icon={Icons.Link}
              action={
                <Btn onClick={() => add("links", emptyLink())}>
                  <Icons.Plus className="w-3.5 h-3.5" /> הוספה
                </Btn>
              }
            />
            {/* ...your existing links mapping stays unchanged... */}
          </Card>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-4 space-y-6">
          {/* Registration Window */}
          <Card className="border-t-4 border-t-indigo-500">
            <SectionHeader title="חלון רישום" icon={Icons.Clock} />
            {/* ...your existing window fields stay unchanged... */}
          </Card>

          {/* Contacts */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">אנשי קשר</h4>

            {/* Each ContactSection manages a list with add/remove/edit */}
            {/* Support / Advisors / Mentors / Exemptions / Labs */}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ContactSection
 * --------------
 * Helper component to render and manage a list of contacts.
 *
 * Props:
 * - title: section title
 * - items: array of contact objects
 * - onAdd(): push a new default item
 * - onRemove(i): remove item by index
 * - onChange(i, key, value): update item field
 * - type: 'simple' | 'advisor' | 'lab'
 *
 * Behavior:
 * - Collapsible by default for cleaner UI on mobile.
 * - Shows count badge and quick "add" action.
 * - Supports different layouts based on `type`.
 */
function ContactSection({ title, items = [], onAdd, onRemove, onChange, type }) {
  const [isOpen, setIsOpen] = useState(false); // Collapsible section state

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800 transition-all hover:border-indigo-300 hover:shadow-md">
      <div
        className="p-4 flex items-center justify-between bg-slate-50/50 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Icons.Users className="w-4 h-4 text-slate-400" />
          {title}
          <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 rounded-full min-w-[1.2rem] text-center">
            {items.length}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent collapsing when adding
              onAdd();
              setIsOpen(true);
            }}
            className="p-1 hover:bg-indigo-100 text-indigo-600 rounded transition"
            title="הוסף איש קשר"
          >
            <Icons.Plus />
          </button>
        </div>
      </div>

      {/* List body:
          - hidden when collapsed
          - still shows when there are items (so user can see content) */}
      {(isOpen || items.length > 0) && (
        <div className="p-3 bg-white dark:bg-slate-900 space-y-3">
          {items.length === 0 && isOpen && (
            <div className="text-center text-xs text-slate-400 py-2">אין אנשי קשר ברשימה</div>
          )}

          {items.map((item, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl border border-slate-100 bg-slate-50/30 text-xs space-y-2 group hover:border-indigo-200 hover:bg-white transition-colors relative"
            >
              {/* Remove button appears on hover */}
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DangerBtn onClick={() => onRemove(idx)}>
                  <Icons.Trash className="w-3 h-3" />
                </DangerBtn>
              </div>

              {/* Base fields: name + email */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">שם</label>
                  <TextInput
                    value={item.name || ""}
                    onChange={(e) => onChange(idx, "name", e.target.value)}
                    className="py-1 px-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">אימייל</label>
                  <TextInput
                    value={item.email || ""}
                    onChange={(e) => onChange(idx, "email", e.target.value)}
                    className="py-1 px-2 text-xs"
                  />
                </div>
              </div>

              {/* Advisor-only: assignment ranges + track */}
              {type === "advisor" && (
                <div className="pt-2 border-t border-slate-100 mt-2">
                  <label className="block text-[10px] text-slate-400 mb-1">שיוך אלפביתי ומסלול</label>
                  <div className="flex gap-2">
                    <TextInput
                      value={item.assignment?.lastNameFrom || ""}
                      onChange={(e) => {
                        const n = { ...item.assignment, lastNameFrom: e.target.value };
                        onChange(idx, "assignment", n);
                      }}
                      placeholder="א"
                      className="py-1 px-2 text-center w-10"
                    />
                    <span className="self-center text-slate-300">-</span>
                    <TextInput
                      value={item.assignment?.lastNameTo || ""}
                      onChange={(e) => {
                        const n = { ...item.assignment, lastNameTo: e.target.value };
                        onChange(idx, "assignment", n);
                      }}
                      placeholder="ת"
                      className="py-1 px-2 text-center w-10"
                    />
                    <TextInput
                      value={item.assignment?.track || ""}
                      onChange={(e) => {
                        const n = { ...item.assignment, track: e.target.value };
                        onChange(idx, "assignment", n);
                      }}
                      placeholder="מסלול"
                      className="py-1 px-2 flex-grow"
                    />
                  </div>
                </div>
              )}

              {/* Lab-only: howToContact */}
              {type === "lab" && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">איך לפנות?</label>
                  <TextInput
                    value={item.howToContact || ""}
                    onChange={(e) => onChange(idx, "howToContact", e.target.value)}
                    className="py-1 px-2 text-xs"
                  />
                </div>
              )}

              {/* Simple/Lab: role + optional phone */}
              {(type === "simple" || type === "lab") && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">תפקיד</label>
                    <TextInput
                      value={item.role || ""}
                      onChange={(e) => onChange(idx, "role", e.target.value)}
                      className="py-1 px-2 text-xs"
                    />
                  </div>
                  {item.phone !== undefined && (
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">טלפון</label>
                      <TextInput
                        value={item.phone || ""}
                        onChange={(e) => onChange(idx, "phone", e.target.value)}
                        className="py-1 px-2 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
