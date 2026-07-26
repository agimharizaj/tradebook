"use client";

import { useState } from "react";

// A miniature of the Journal's monthly calendar: green/red days from PnL,
// click a day to see its line, month summary underneath. All numbers are
// scripted demo data.
type Day = { d: number; pnl?: number; trades?: number };

const DAYS: Day[] = [
  { d: 1 }, { d: 2, pnl: 184, trades: 2 }, { d: 3, pnl: -95, trades: 1 }, { d: 4, pnl: 212, trades: 2 }, { d: 5 },
  { d: 6 }, { d: 7 },
  { d: 8, pnl: 143, trades: 1 }, { d: 9 }, { d: 10, pnl: -230, trades: 3 }, { d: 11, pnl: 87, trades: 1 }, { d: 12, pnl: 305, trades: 2 },
  { d: 13 }, { d: 14 },
  { d: 15, pnl: -60, trades: 1 }, { d: 16, pnl: 178, trades: 2 }, { d: 17 }, { d: 18, pnl: 96, trades: 1 }, { d: 19, pnl: 254, trades: 2 },
  { d: 20 }, { d: 21 },
  { d: 22, pnl: -145, trades: 2 }, { d: 23, pnl: 121, trades: 1 }, { d: 24, pnl: 202, trades: 2 }, { d: 25 }, { d: 26, pnl: 88, trades: 1 },
  { d: 27 }, { d: 28 },
];

export default function JournalDemo() {
  const [sel, setSel] = useState<Day | null>(null);

  const traded = DAYS.filter((x) => x.pnl != null) as Required<Day>[];
  const net = traded.reduce((s, x) => s + x.pnl, 0);
  const wins = traded.filter((x) => x.pnl > 0).length;

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Journal · month view · demo
        </span>
        <span className={`font-mono text-xs ${net >= 0 ? "text-success" : "text-danger"}`}>
          {net >= 0 ? "+" : ""}{net.toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="pb-1 text-[10px] text-dim">{d}</div>
        ))}
        {DAYS.map((day) => {
          const tone =
            day.pnl == null
              ? "bg-surface2/50 text-dim"
              : day.pnl >= 0
                ? "bg-success/15 text-success"
                : "bg-danger/15 text-danger";
          return (
            <button
              key={day.d}
              type="button"
              onClick={() => setSel(day.pnl != null ? day : null)}
              aria-label={`Day ${day.d}`}
              className={`rounded-md py-1.5 font-mono text-[11px] transition hover:ring-1 hover:ring-accent/60 ${tone} ${
                sel?.d === day.d ? "ring-1 ring-accent" : ""
              }`}
            >
              {day.d}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg bg-surface2 px-3 py-2 font-mono text-xs text-dim">
        {sel && sel.pnl != null ? (
          <>
            Day {sel.d}: {sel.trades} trade{sel.trades === 1 ? "" : "s"},{" "}
            <span className={sel.pnl >= 0 ? "text-success" : "text-danger"}>
              {sel.pnl >= 0 ? "+" : ""}{sel.pnl}
            </span>{" "}
            · tap another day
          </>
        ) : (
          <>
            {traded.length} trading days · {wins}W / {traded.length - wins}L · tap a day
          </>
        )}
      </div>
    </div>
  );
}
