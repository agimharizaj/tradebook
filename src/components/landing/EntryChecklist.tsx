"use client";

import { useState } from "react";

// The entry-criteria checklist from the strategy builder, working for real.
// Same tick + strike-through behavior as the app.
const ITEMS = [
  "Liquidity taken above Asia high",
  "15m structure shift confirmed",
  "Entry inside FVG, risk 0.5%",
];

export default function EntryChecklist() {
  const [done, setDone] = useState<boolean[]>([true, false, false]);

  const toggle = (i: number) =>
    setDone((d) => d.map((v, j) => (j === i ? !v : v)));

  const ready = done.every(Boolean);

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Entry criteria · London sweep
        </span>
        <span className={`font-mono text-xs ${ready ? "text-success" : "text-dim"}`}>
          {done.filter(Boolean).length}/{ITEMS.length}
        </span>
      </div>
      {ITEMS.map((text, i) => (
        <button
          key={text}
          type="button"
          onClick={() => toggle(i)}
          aria-pressed={done[i]}
          className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-sm transition hover:bg-surface2"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
              done[i] ? "border-success bg-success text-background" : "border-border2"
            }`}
          >
            {done[i] ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : null}
          </span>
          <span className={done[i] ? "text-muted line-through" : ""}>{text}</span>
        </button>
      ))}
      <div className="mt-3 rounded-lg bg-surface2 px-3 py-2 font-mono text-xs text-dim">
        {ready
          ? "All criteria met. Now it is your trade."
          : "Max daily loss -1% · Window 07:00-11:00 London"}
      </div>
    </div>
  );
}
