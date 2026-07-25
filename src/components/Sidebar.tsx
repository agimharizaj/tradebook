"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LogoMark from "@/components/LogoMark";
import ThemeToggle from "@/components/ThemeToggle";
import { NAV, PROFILE } from "@/lib/nav";

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

export default function Sidebar({ email, name }: { email: string; name?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(240);
  const [dragging, setDragging] = useState(false);
  const displayLabel = name && name.trim() ? name : email;

  const MIN = 200;
  const MAX = 380;
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    setCollapsed(localStorage.getItem("tb_sidebar_collapsed") === "1");
    const w = parseInt(localStorage.getItem("tb_sidebar_width") || "", 10);
    if (!Number.isNaN(w)) setWidth(Math.min(MAX, Math.max(MIN, w)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (e: PointerEvent) => {
      const w = Math.min(MAX, Math.max(MIN, e.clientX));
      widthRef.current = w;
      setWidth(w);
    };
    const onUp = () => {
      setDragging(false);
      localStorage.setItem("tb_sidebar_width", String(widthRef.current));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("tb_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  const itemClass = (active: boolean) =>
    `flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
      collapsed ? "justify-center" : "gap-3"
    } ${active ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"}`;

  return (
    <>
    <aside
      style={{ width: collapsed ? 64 : width }}
      className={`relative hidden h-screen shrink-0 flex-col border-r border-border bg-background md:flex ${
        dragging ? "" : "transition-[width] duration-200"
      }`}
    >
      <Link
        href="/dashboard"
        className={`flex h-16 items-center px-3 transition hover:opacity-80 ${collapsed ? "justify-center" : "gap-2.5"}`}
      >
        <LogoMark size={32} className="shrink-0 rounded-lg shadow-[0_6px_18px_rgba(124,108,255,0.35)]" />
        {!collapsed && <span className="font-display text-[17px] font-semibold">Tradebook</span>}
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={itemClass(pathname.startsWith(item.href))}>
            <Icon d={item.icon} />
            {!collapsed && item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <Link href={PROFILE.href} title={collapsed ? "Profile" : undefined} className={itemClass(pathname.startsWith(PROFILE.href))}>
          <Icon d={PROFILE.icon} />
          {!collapsed && <span className="truncate">{displayLabel}</span>}
        </Link>
        <ThemeToggle collapsed={collapsed} />
        <div className={`mt-1 flex ${collapsed ? "flex-col items-center gap-1" : "items-center justify-between"}`}>
          <form action="/auth/signout" method="post" className={collapsed ? "" : "flex-1"}>
            <button
              type="submit"
              title="Sign out"
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-foreground ${collapsed ? "justify-center" : "w-full gap-2"}`}
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

      {!collapsed && (
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDoubleClick={() => {
            setWidth(240);
            localStorage.setItem("tb_sidebar_width", "240");
          }}
          title="Drag to resize, double-click to reset"
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition hover:bg-accent/40"
        />
      )}
    </aside>
    {dragging && <div className="fixed inset-0 z-[60] cursor-col-resize" />}
    </>
  );
}
