"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, PROFILE } from "@/lib/nav";

const ALL = [...NAV, PROFILE];
// 4 primary destinations + More: 9 tabs never fit a phone, and the old
// overflow-x-auto bar silently hid the last three sections.
const PRIMARY_HREFS = ["/dashboard", "/charts", "/journal", "/risk"];
const PRIMARY = PRIMARY_HREFS.map((h) => ALL.find((i) => i.href === h)!);
const SECONDARY = ALL.filter((i) => !PRIMARY_HREFS.includes(i.href));

export default function MobileNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const moreActive = SECONDARY.some((i) => pathname.startsWith(i.href));

  return (
    <>
      {more && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMore(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {SECONDARY.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMore(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs transition ${
                      active ? "bg-accent-soft text-accent2" : "bg-surface2 text-muted"
                    }`}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="z-50 flex shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {PRIMARY.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${
                active ? "text-accent2" : "text-muted"
              }`}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.short}
            </Link>
          );
        })}
        <button
          onClick={() => setMore((m) => !m)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${
            more || moreActive ? "text-accent2" : "text-muted"
          }`}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
          </svg>
          More
        </button>
      </nav>
    </>
  );
}
