"use client";

// One currency picker for everywhere an account currency is chosen: the risk
// calculator, Settings > Trading profile, and prop-firm accounts. A searchable
// dropdown (same pattern as the Trading page's PairSelect), not free text -
// a typo like "GPB" silently broke FX conversion and symbols, and the native
// select made a 20-item list a scroll chore. The list sticks to currencies
// /api/fx can convert (Frankfurter/ECB set); type a code or a name to filter.
import { useEffect, useRef, useState } from "react";

const CURRENCIES: [code: string, name: string][] = [
  ["USD", "US dollar"],
  ["EUR", "Euro"],
  ["GBP", "British pound"],
  ["JPY", "Japanese yen"],
  ["AUD", "Australian dollar"],
  ["CAD", "Canadian dollar"],
  ["CHF", "Swiss franc"],
  ["NZD", "New Zealand dollar"],
  ["SGD", "Singapore dollar"],
  ["HKD", "Hong Kong dollar"],
  ["SEK", "Swedish krona"],
  ["NOK", "Norwegian krone"],
  ["DKK", "Danish krone"],
  ["PLN", "Polish zloty"],
  ["CZK", "Czech koruna"],
  ["HUF", "Hungarian forint"],
  ["ZAR", "South African rand"],
  ["MXN", "Mexican peso"],
  ["TRY", "Turkish lira"],
  ["AED", "UAE dirham"],
];

export default function CurrencySelect({
  value,
  onChange,
  className = "field",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // A saved value from the free-text days stays selectable instead of being
  // silently swapped for the first option.
  const list: [string, string][] = CURRENCIES.some(([c]) => c === value)
    ? CURRENCIES
    : value
      ? [[value, "saved value"], ...CURRENCIES]
      : CURRENCIES;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const filtered = list.filter(
    ([c, n]) => c.toLowerCase().includes(needle) || n.toLowerCase().includes(needle)
  );

  function pick(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() =>
          setOpen((o) => {
            if (!o) {
              setQ("");
              requestAnimationFrame(() => searchRef.current?.focus());
            }
            return !o;
          })
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Account currency"
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className="font-mono">{value || "Select…"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-dim" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-56 rounded-xl border border-border2 bg-card py-1.5 shadow-2xl"
        >
          <div className="px-2 pb-1.5">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  pick(filtered[0][0]);
                }
              }}
              placeholder="Search currencies…"
              aria-label="Search currencies"
              className="w-full rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-xs outline-none transition focus:border-accent"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-dim">No currencies match.</p>
            )}
            {filtered.map(([code, name]) => {
              const active = code === value;
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(code)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                    active ? "bg-accent-soft text-accent2" : "text-muted hover:bg-surface2 hover:text-foreground"
                  }`}
                >
                  <span className="w-10 shrink-0 font-mono">{code}</span>
                  <span className="truncate text-xs text-dim">{name}</span>
                  {active && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
