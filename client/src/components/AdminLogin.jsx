import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;
const ADMIN_API = `${API_BASE}/api/admin`;

export default function AdminLogin({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("login"); // login | forgot | reset
  const [msg, setMsg] = useState("");

  const login = async () => {
    setMsg("");
    const res = await fetch(`${ADMIN_API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    onSuccess(data);
  };

  const sendCode = async () => {
    setMsg("");
    const res = await fetch(`${ADMIN_API}/security/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setMode("reset");
    setMsg("📧 קוד נשלח למייל");
  };

  const resetPassword = async () => {
    setMsg("");
    const res = await fetch(`${ADMIN_API}/security/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, newPassword: password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setMode("login");
    setMsg("✅ סיסמה עודכנה");
  };

  return (
    <div className="space-y-4">
      <div className="text-lg font-bold text-blue-700">כניסת מנהלת</div>

      <input
        type="email"
        placeholder="אימייל"
        className="w-full border rounded-xl px-4 py-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {(mode === "login" || mode === "reset") && (
        <input
          type="password"
          placeholder={mode === "login" ? "סיסמה" : "סיסמה חדשה"}
          className="w-full border rounded-xl px-4 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      {mode === "reset" && (
        <input
          placeholder="קוד שקיבלת במייל"
          className="w-full border rounded-xl px-4 py-2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      )}

      {msg && <div className="text-sm text-red-600">{msg}</div>}

      {mode === "login" && (
        <>
          <button className="w-full bg-blue-600 text-white rounded-xl py-2" onClick={login}>
            התחברות
          </button>
          <button className="text-xs underline" onClick={() => setMode("forgot")}>
            שכחתי סיסמה
          </button>
        </>
      )}

      {mode === "forgot" && (
        <>
          <button className="w-full bg-gray-600 text-white rounded-xl py-2" onClick={sendCode}>
            שלח קוד למייל
          </button>
          <button className="text-xs underline" onClick={() => setMode("login")}>
            חזרה
          </button>
        </>
      )}

      {mode === "reset" && (
        <button className="w-full bg-green-600 text-white rounded-xl py-2" onClick={resetPassword}>
          עדכן סיסמה
        </button>
      )}
    </div>
  );
}
