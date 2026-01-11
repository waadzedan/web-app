import { useRef, useState } from "react";

const API_BASE = "http://localhost:5000";

export default function UploadLabs() {
  const fileRef = useRef(null);

  const [yearId, setYearId] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [semester, setSemester] = useState("");   // ✅ חדש
  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const chooseFile = () => {
    fileRef.current?.click();
  };

  const upload = async () => {
    if (!yearId || !yearLabel || !semester || !file) {
      setMsg({
        type: "error",
        text: "יש למלא שנה, סמסטר ולבחור קובץ Excel",
      });
      return;
    }

    setLoading(true);
    setMsg({ type: "", text: "" });

    try {
      const form = new FormData();
      form.append("yearId", yearId);
      form.append("yearLabel", yearLabel);
      form.append("semester", semester);     // ✅ נשלח לשרת
      form.append("file", file);

      const res = await fetch(`${API_BASE}/api/admin/upload/labs`, {
        method: "POST",
        headers: {
          "x-admin-key": sessionStorage.getItem("bio_admin_key"),
        },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setMsg({ type: "ok", text: "✅ לוח המעבדות יובא בהצלחה" });
      setFile(null);
      setYearId("");
      setYearLabel("");
      setSemester("");
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-2xl p-4 bg-white space-y-4">
      <div className="text-lg font-bold">📦 ייבוא לוח מעבדות (Excel)</div>

      {/* Year */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">
            מזהה שנה (DB)
          </label>
          <input
            dir="ltr"
            className="w-full border rounded-xl px-3 py-2"
            placeholder="tashpaz"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">
            תווית שנה (לתצוגה)
          </label>
          <input
            className="w-full border rounded-xl px-3 py-2"
            placeholder="תשפ״ז"
            value={yearLabel}
            onChange={(e) => setYearLabel(e.target.value)}
          />
        </div>
      </div>

      {/* Semester */}
      <div>
        <label className="text-sm font-semibold block mb-1">
          סמסטר
        </label>
        <select
          className="w-full border rounded-xl px-3 py-2"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
        >
          <option value="">בחרי סמסטר</option>
          {[1,2,3,4,5,6,7,8].map((s) => (
            <option key={s} value={s}>
              סמסטר {s}
            </option>
          ))}
        </select>
      </div>

      {/* File picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button
          type="button"
          onClick={chooseFile}
          className="px-4 py-2 rounded-full border bg-gray-50 hover:bg-gray-100 text-sm"
        >
          📊 בחירת קובץ Excel
        </button>

        {file && (
          <span dir="ltr" className="text-xs text-gray-600">
            {file.name}
          </span>
        )}
      </div>

      {/* Upload */}
      <button
        onClick={upload}
        disabled={loading}
        className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
      >
        {loading ? "מייבא..." : "⬆️ ייבוא לוח מעבדות"}
      </button>

      {/* Warning */}
      <div className="text-[11px] text-amber-600">
        ⚠️ ייבוא לוח מעבדות ידרוס נתונים קיימים <strong>לאותה שנה ואותו סמסטר בלבד</strong>
      </div>

      {/* Message */}
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
