"use client";

import { useEffect, useRef, useState } from "react";

// Scripted preview of Sidekick, the AI assistant. Clicking a question types
// out a canned answer; inside the app the answers come from the user's own
// journal, strategies and stats.
const SCRIPT: { q: string; a: string }[] = [
  {
    q: "Where am I leaking money?",
    a: "Two leaks stand out. Fridays: 9 trades, 22% win rate, net -412. And GBPJPY: your average loss there is 2.1x your average loss elsewhere. Everything else is close to breakeven or better.",
  },
  {
    q: "Am I breaking my risk rules?",
    a: "Twice this month. On the 10th you took 3 trades against a 2-per-day cap, and on the 22nd your net -145 passed your daily loss limit after the second trade. Both days started with a loss before 9am.",
  },
  {
    q: "Check this setup against my rules",
    a: "Against \"London sweep\": liquidity taken above Asia high - met. 15m structure shift - met. Entry inside FVG - cannot tell from this zoom. 2 of 3 confirmed; the entry criterion is the one that pays, so zoom in before you decide. Your call from here.",
  },
];

export default function SidekickDemo() {
  const [qi, setQi] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function ask(i: number) {
    if (timer.current) clearInterval(timer.current);
    setQi(i);
    setTyped("");
    const full = SCRIPT[i].a;
    let n = 0;
    timer.current = setInterval(() => {
      n += 3;
      setTyped(full.slice(0, n));
      if (n >= full.length && timer.current) clearInterval(timer.current);
    }, 24);
  }

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Sidekick · AI · scripted demo
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCRIPT.map((s, i) => (
          <button
            key={s.q}
            type="button"
            onClick={() => ask(i)}
            className={`rounded-full border px-3 py-1.5 text-[13px] transition ${
              qi === i
                ? "border-accent/60 bg-accent-soft text-accent2"
                : "border-border2 text-muted hover:border-accent/50 hover:text-accent2"
            }`}
          >
            {s.q}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-[130px] rounded-xl border border-border bg-surface2/60 px-4 py-3 text-sm leading-relaxed">
        {qi === null ? (
          <span className="text-dim">Pick a question. Inside the app, answers come from your own trades, rules and notes.</span>
        ) : (
          <span className="whitespace-pre-wrap">{typed}<span className="animate-pulse text-accent2">▍</span></span>
        )}
      </div>
    </div>
  );
}
