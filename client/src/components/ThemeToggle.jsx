import { useTheme } from "../theme/ThemeProvider.jsx";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="rounded-xl px-3 py-2 text-sm font-medium border
                 bg-white/70 hover:bg-white
                 dark:bg-slate-900/70 dark:hover:bg-slate-900
                 dark:border-slate-700 transition"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
