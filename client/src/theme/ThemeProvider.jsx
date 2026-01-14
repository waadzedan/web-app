import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("bio-bot-theme");
    if (saved === "light" || saved === "dark") return saved;

    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  });

  // ✅ NEW: פונקציה מרכזית ששומרת + מעדכנת class מיד (יותר אמין)
  const applyTheme = (next) => {
    localStorage.setItem("bio-bot-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  };

  // ✅ NEW: toggle שמשתמש ב-applyTheme כדי לוודא שה-class מתעדכן מיידית
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    // ✅ NEW (דיבוג): תראי בקונסול שזה באמת התחלף
    console.log("Theme switched to:", next);
  };

  // ✅ NEW: כשנטען/משתנה theme, מוודאים שה-class תמיד מסונכרן
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme: applyTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

