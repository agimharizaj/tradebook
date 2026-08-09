"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, PROFILE, SETTINGS } from "@/lib/nav";

const ITEMS = [...NAV, SETTINGS, PROFILE];

// Instagram-style floating tab bar: a detached rounded pill with icon-only
// items over a blurred backdrop; the active item sits in a filled circle.
// Still horizontally scrollable - every destination stays reachable.
export default function MobileNav() {
  const pathname = usePathname();
  return (
    // Fixed to the viewport, not in the shell's flow: iOS Safari's collapsing
    // toolbars and the standalone --app-height measurement both lag reality,
    // and an in-flow bar inherits every mismatch as a visible gap. Fixed
    // bottom-0 stays glued regardless; main gets bottom padding to clear it.
    <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
      <nav
        className="scrollbar-none mx-3 mb-[max(4px,calc(env(safe-area-inset-bottom)-8px))] mt-1.5 flex items-center overflow-x-auto rounded-full border border-border2 bg-background/90 px-1.5 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur"
        aria-label="Primary"
      >
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              data-tour={item.href === "/settings" ? "settings" : `nav${item.href.replace("/", "-")}`}
              className="flex h-11 w-[52px] shrink-0 items-center justify-center"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                  active ? "bg-accent-soft text-accent2" : "text-muted"
                }`}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
              </span>
            </Link>
          );
        })}
      </nav>
      {/* Right-edge fade: signals the pill scrolls without hiding anything permanently */}
      <div className="pointer-events-none absolute inset-y-1.5 right-3 w-10 rounded-r-full bg-gradient-to-l from-background/90 to-transparent" />
    </div>
  );
}
