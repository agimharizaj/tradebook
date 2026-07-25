"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, PROFILE } from "@/lib/nav";

const ITEMS = [...NAV, PROFILE];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="relative shrink-0 md:hidden">
      <nav className="scrollbar-none flex overflow-x-auto border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex w-[72px] shrink-0 flex-col items-center gap-1 py-2.5 text-[11px] transition ${
                active ? "text-accent2" : "text-muted"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                  active ? "bg-accent-soft" : ""
                }`}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </span>
              {item.short}
            </Link>
          );
        })}
      </nav>
      {/* Right-edge fade: signals the bar scrolls without hiding anything permanently */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
