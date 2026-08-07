"use client";

// The one pair dropdown for FORMS (risk calculator, add-trade, analysis log,
// note/strategy tags) - same look as the Trading toolbar's PairSelect: opens
// downward, pair flags, filters as you type. Native selects put a 20-item
// wall on screen and datalists have no flags. Fixed-positioned from the
// trigger rect so scrollable modals can't clip it; closes on outside click,
// Escape, or any scroll (the menu is fixed and would detach).
// allowCustom keeps free entry for imports: typing an unknown symbol offers
// a "Use ..." row instead of dead-ending.
import { useEffect, useRef, useState } from "react";
import PairFlag from "@/components/PairFlag";

export default function PairPicker({
  pairs,
  value,
  onChange,
  className = "field",
  emptyLabel,
  allowCustom = false,
  ariaLabel = "Pair",
}: {
  pairs: string[];
  value: string;
  onChange: (pair: string) => void;
  className?: string;
  // When set, an explicit "no pair" choice with this label is offered and ""
  // is a valid value.
  emptyLabel?: string;
  allowCustom?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  function toggle() {
    setOpen((o) => {
      if (!o && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        // Clamp so the ~320px menu stays on screen near the viewport bottom.
        const top = Math.min(r.bottom + 6, Math.max(8, window.innerHeight - 336));
        setAnchor({ top, left: Math.max(8, r.left), width: Math.max(224, r.width) });
        setQ("");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      return !o;
    });
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onScroll = (e: Event) => {
      // Scrolling inside the menu itself is fine; anything else detaches the
      // fixed menu from its trigger, so close.
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  // A saved pair no longer on the watchlist stays selectable.
  const list = value && !pairs.includes(value) ? [value, ...pairs] : pairs;
  const filtered = list.filter((p) => p.toLowerCase().includes(needle));
  const custom =
    allowCustom && q.trim() && !list.some((p) => p.toLowerCase() === needle) ? q.trim().toUpperCase() : null;

  function pick(p: string) {
    onChange(p);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${className} flex items-center gap-2 text-left`}
      >
        {value ? (
          <>
            <PairFlag pair={value} size={16} />
            <span className="truncate">{value}</span>
          </>
        ) : (
          <span className="text-dim">{emptyLabel ?? "Select pair…"}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-dim" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && anchor && (
        <div
          ref={menuRef}
          style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
          role="listbox"
          className="fixed z-50 rounded-xl border border-border2 bg-card py-1.5 shadow-2xl"
        >
          <div className="px-2 pb-1.5">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length > 0) pick(filtered[0]);
                  else if (custom) pick(custom);
                }
              }}
              placeholder="Search pairs…"
              aria-label="Search pairs"
              className="w-full rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-xs outline-none transition focus:border-accent"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {emptyLabel !== undefined && !needle && (
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                onClick={() => pick("")}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                  value === "" ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"
                }`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.map((p) => {
              const active = p === value;
              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(p)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                    active ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"
                  }`}
                >
                  <PairFlag pair={p} size={16} />
                  {p}
                  {active && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-auto" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
            {custom && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(custom)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-accent2 transition hover:bg-surface2"
              >
                Use &quot;{custom}&quot;
              </button>
            )}
            {filtered.length === 0 && !custom && (
              <p className="px-3 py-2 text-xs text-dim">No pairs match.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
