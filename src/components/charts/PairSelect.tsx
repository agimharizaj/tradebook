"use client";

// Custom pair picker for the Trading toolbar. Replaces the native <select>,
// whose macOS popup anchors around the selected item and sprawls upward off
// the screen with a long watchlist. This one always opens DOWNWARD, shows
// pair flags, and filters as you type. Fixed-positioned from the button's
// rect because the toolbar is an overflow-x-auto strip that clips absolute
// children (same trick as SnapshotMenu).
import { useEffect, useRef, useState } from "react";
import PairFlag from "@/components/PairFlag";

export default function PairSelect({
  pairs,
  value,
  onPick,
}: {
  pairs: { label: string; tv: string }[];
  value: string; // current tv symbol
  onPick: (tv: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const current = pairs.find((p) => p.tv === value)?.label ?? value;

  function toggle() {
    setOpen((o) => {
      if (!o && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        // Clamp inside the viewport (panel is w-56 = 224px) so it can't
        // anchor off the right edge on narrow phone screens.
        const left = Math.max(8, Math.min(r.left, window.innerWidth - 224 - 8));
        setAnchor({ top: r.bottom + 6, left });
        setQ("");
        // Auto-focus only with a mouse/trackpad. On touch devices the iOS
        // keyboard would instantly cover the list; let the user tap search.
        if (!window.matchMedia("(pointer: coarse)").matches) {
          requestAnimationFrame(() => searchRef.current?.focus());
        }
      }
      return !o;
    });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const filtered = pairs.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Trading pair"
        className="flex shrink-0 items-center gap-2 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-sm outline-none transition focus:border-accent"
      >
        <PairFlag pair={current} size={16} />
        {current}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dim" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && anchor && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            style={{ top: anchor.top, left: anchor.left }}
            role="listbox"
            className="fixed z-30 w-56 rounded-xl border border-border2 bg-card py-1.5 shadow-2xl"
          >
            <div className="px-2 pb-1.5">
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length > 0) {
                    onPick(filtered[0].tv);
                    setOpen(false);
                  }
                }}
                placeholder="Search pairs…"
                aria-label="Search pairs"
                className="w-full rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-base outline-none transition focus:border-accent md:text-xs"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-dim">No pairs match.</p>
              )}
              {filtered.map((p) => {
                const active = p.tv === value;
                return (
                  <button
                    key={p.tv}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onPick(p.tv);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                      active ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"
                    }`}
                  >
                    <PairFlag pair={p.label} size={16} />
                    {p.label}
                    {active && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
