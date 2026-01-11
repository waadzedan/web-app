import { useRef, useState } from "react";

const API_BASE = "http://localhost:5000";

export default function UploadYearbook() {
  const fileRef = useRef(null);

  const [yearbookId, setYearbookId] = useState("");     // ID טכני
  const [yearbookLabel, setYearbookLabel] = useState(""); // שם תצוגה
  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const chooseFile = () => {
    fileRef.current?.click();
  };

  const upload = async () => {
    if (!yearbookId || !yearbookLabel || !file) {
      setMsg({
        type: "error",
        text: "יש למלא מזהה שנתון, שם תצוגה ולבחור קובץ DOCX",
      });
      return;
    }

    setLoading(true);
    setMsg({ type: "", text: "" });

    try {
      const form = new FormData();
      form.append("yearbookId", yearbookId);       // ID
      form.append("yearbookLabel", yearbookLabel); // תצוגה
      form.append("file", file);

      const res = await fetch(`${API_BASE}/api/admin/upload/yearbook`, {
        method: "POST",
        headers: {
          "x-admin-key": sessionStorage.getItem("bio_admin_key"),
        },
        body: form,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("❌ השרת לא החזיר JSON תקין");
      }

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setMsg({ type: "ok", text: "✅ השנתון יובא ונשמר בהצלחה" });
      setFile(null);
      setYearbookId("");
      setYearbookLabel("");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-2xl p-4 bg-white space-y-4">
      <div className="text-lg font-bold">📦 ייבוא שנתון (DOCX)</div>

      {/* ID */}
      <div>
        <label className="text-sm font-semibold block mb-1">
          מזהה שנתון (טכני)
        </label>
        <input
          dir="ltr"
          className="w-full border rounded-xl px-3 py-2"
          placeholder="shnaton_tashpaz"
          value={yearbookId}
          onChange={(e) => setYearbookId(e.target.value)}
        />
        <div className="text-[11px] text-gray-500 mt-1">
          ⚠️ אנגלית בלבד, ללא רווחים
        </div>
      </div>

      {/* Label */}
      <div>
        <label className="text-sm font-semibold block mb-1">
          שם תצוגה לסטודנטים
        </label>
        <input
          className="w-full border rounded-xl px-3 py-2"
          placeholder='תשפ״ז'
          value={yearbookLabel}
          onChange={(e) => setYearbookLabel(e.target.value)}
        />
      </div>

      {/* File picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button
          type="button"
          onClick={chooseFile}
          className="px-4 py-2 rounded-full border bg-gray-50 hover:bg-gray-100 text-sm"
        >
          📄 בחירת קובץ DOCX
        </button>

        {file && (
          <span dir="ltr" className="text-xs text-gray-600">
            {file.name}
          </span>
        )}
      </div>

      <button
        onClick={upload}
        disabled={loading}
        className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
      >
        {loading ? "מייבא..." : "⬆️ העלאת השנתון"}
      </button>

      {msg.text && (
        <div
          className={`text-sm ${
            msg.type === "error" ? "text-red-600" : "text-green-600"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
