import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function AdminSecurity({ adminId }) {
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  const API = `${API_BASE}/api/admin/security`;


  const post = async (url, body) => {
    setMsg("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "שגיאה");
      return;
    }
    setMsg("✅ נשמר בהצלחה");
  };

  return (
    <div className="space-y-6">
      {/* שינוי סיסמה */}
      <div>
        <div className="font-semibold mb-1">🔐 שינוי סיסמה</div>
        <input
          type="password"
          placeholder="סיסמה חדשה"
          className="w-full border rounded-xl px-3 py-2"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button
          className="mt-2 text-sm text-blue-600 underline"
          onClick={() =>
            post(`${API}/change-password`, {
              adminId,          // ✅ במקום uid
              newPassword,
            })
          }
        >
          עדכן סיסמה
        </button>
      </div>

      {/* שינוי אימייל */}
      <div>
        <div className="font-semibold mb-1">✉️ שינוי אימייל</div>
        <input
          type="email"
          placeholder="אימייל חדש"
          className="w-full border rounded-xl px-3 py-2"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <button
          className="mt-2 text-sm text-blue-600 underline"
          onClick={() =>
            post(`${API}/change-email`, {
              adminId,          // ✅ במקום uid
              newEmail,
            })
          }
        >
          עדכן אימייל
        </button>
      </div>

      {msg && <div className="text-sm text-green-600">{msg}</div>}
    </div>
  );
}
