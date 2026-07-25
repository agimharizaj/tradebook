"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, PROFILE } from "@/lib/nav";

const ITEMS = [...NAV, PROFILE];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 overflow-x-auto border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-[64px] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition ${
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
    </nav>
  );
}
