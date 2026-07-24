"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoMark from "@/components/LogoMark";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { href: "/strategy", label: "Strategy", icon: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { href: "/journal", label: "Journal", icon: "M4 4h16v16H4zM4 9h16M9 4v16" },
  { href: "/risk", label: "Risk", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4M12 16h.01" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export default function Sidebar({
  email,
  name,
}: {
  email: string;
  name?: string;
}) {
  const displayLabel = name && name.trim() ? name : email;
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("tb_sidebar_collapsed") === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("tb_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={`hidden h-screen shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <Link
        href="/dashboard"
        className={`flex h-16 items-center px-3 transition hover:opacity-80 ${
          collapsed ? "justify-center" : "gap-2.5"
        }`}
      >
        <LogoMark size={32} className="shrink-0 rounded-lg shadow-[0_6px_18px_rgba(124,108,255,0.35)]" />
        {!collapsed && (
          <span className="font-display text-[17px] font-semibold">Tradebook</span>
        )}
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                collapsed ? "justify-center" : "gap-3"
              } ${
                active
                  ? "bg-accent-soft text-accent2"
                  : "text-muted hover:bg-surface2 hover:text-foreground"
              }`}
            >
              <Icon d={item.icon} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        {!collapsed && (
          <Link
            href="/profile"
            className="mb-1 block truncate px-2 py-1 text-xs text-muted hover:text-foreground"
            title={email}
          >
            {displayLabel}
          </Link>
        )}
        <div className={`flex ${collapsed ? "flex-col items-center gap-1" : "items-center justify-between"}`}>
          <form action="/auth/signout" method="post" className={collapsed ? "" : "flex-1"}>
            <button
              type="submit"
              title="Sign out"
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-foreground ${
                collapsed ? "justify-center" : "w-full gap-2"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              {!collapsed && "Sign out"}
            </button>
          </form>
          <button
            onClick={toggle}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
