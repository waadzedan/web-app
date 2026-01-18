// Navbar.jsx
// ----------
// Top navigation bar of BIO-BOT.
// Displays logo, navigation buttons, admin link, and a Light/Dark mode toggle.
//
// Props:
// - view: current active view key ("home" | "chat" | "labs" | "admin")
// - onNavigate(key): callback to switch views
//
// Includes ThemeToggle button to switch between Light/Dark mode.

import ThemeToggle from "./ThemeToggle"; // Light/Dark mode toggle button

export default function Navbar({ view, onNavigate }) {
  const item = (key, label) => {
    const isActive = view === key;

    return (
      <button
        type="button"
        onClick={() => onNavigate(key)}
        className={`relative px-5 py-2 text-sm font-bold transition-all duration-300 rounded-full
          ${
            isActive
              ? "text-[#F5B301] bg-white/10 shadow-[inset_0_0_0_1px_rgba(245,179,1,0.2)]"
              : "text-white/90 hover:text-white hover:bg-white/5"
          }`}
      >
        {label}

        {/* Active underline indicator */}
        {isActive && (
          <span className="absolute inset-x-5 -bottom-0.5 h-0.5 bg-[#F5B301] rounded-full shadow-[0_0_10px_#F5B301]" />
        )}
      </button>
    );
  };

  return (
    <header
      className="
        sticky top-0 z-50 
        bg-[#162A5A]
        dark:bg-[#0B1220]
        border-b border-[#F5B301]/40 
        shadow-xl
      "
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo & Brand */}
        <div
          className="flex items-center gap-4 cursor-pointer group"
          onClick={() => onNavigate("home")}
        >
          <img
            src="/assets/logo.png"
            alt="BIO BOT"
            className="w-12 h-12 object-contain bg-white rounded-full p-1.5 ring-2 ring-white/10 group-hover:ring-[#F5B301]/50 transition-all duration-300"
          />
          <div className="flex flex-col">
            <span className="text-2xl font-black text-white tracking-tight leading-none mb-1 uppercase">
              BIO BOT
            </span>
            <span className="text-[11px] font-medium text-blue-200 tracking-wider uppercase opacity-80">
              Braude Biotechnology Assistant
            </span>
          </div>
        </div>

        {/* Navigation (RTL for Hebrew) */}
        <nav className="flex items-center gap-2" dir="rtl">
          {item("home", "בית")}
          {item("chat", "צ׳אט")}
          {item("labs", "לוח מעבדות")}

          <div className="w-[1px] h-6 bg-white/10 mx-3" />

          {item("admin", "אזור מנהל")}
        </nav>

        {/* Theme toggle button */}
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
