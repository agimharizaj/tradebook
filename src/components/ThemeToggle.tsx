"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];

function resolve(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("tb_theme") as Theme) || "system";
    setTheme(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("tb_theme") as Theme) === "system") resolve("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    localStorage.setItem("tb_theme", next);
    setTheme(next);
    resolve(next);
  }

  const icon =
    theme === "dark"
      ? "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
      : theme === "light"
        ? "M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
        : "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z";
  const label = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label}`}
      className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-foreground ${
        collapsed ? "justify-center" : "w-full gap-2"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d={icon} />
      </svg>
      {!collapsed && `Theme: ${label}`}
    </button>
  );
}
