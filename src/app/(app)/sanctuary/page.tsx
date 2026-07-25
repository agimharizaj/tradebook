"use client";

import { useEffect, useState } from "react";

const PHASES = [
  { label: "Breathe in", dur: 4, scale: 1 },
  { label: "Hold", dur: 4, scale: 1 },
  { label: "Breathe out", dur: 4, scale: 0.55 },
  { label: "Hold", dur: 4, scale: 0.55 },
];

const QUOTES = [
  "You don't need the next trade. You need your process.",
  "Protect capital first. Your edge plays out over many trades.",
  "Bias is a plan plus invalidation, not a prediction.",
  "If invalidation hits, reset. No coping, no revenge trade.",
  "Consistency comes from calm, repeatable execution.",
  "You are not your last trade.",
];

export default function SanctuaryPage() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [quote, setQuote] = useState(0);

  useEffect(() => {
    if (!running) return;
    const p = PHASES[phase];
    const t = setTimeout(() => setPhase((x) => (x + 1) % PHASES.length), p.dur * 1000);
    return () => clearTimeout(t);
  }, [running, phase]);

  useEffect(() => {
    const i = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 9000);
    return () => clearInterval(i);
  }, []);

  const cur = PHASES[phase];
  const scale = running ? cur.scale : 0.7;
  const dur = running ? cur.dur : 0.6;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl">Sanctuary</h1>
      <p className="mt-1 text-muted">A moment to reset before or after the session.</p>

      <div className="relative my-12 flex h-64 w-64 items-center justify-center">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            transform: `scale(${scale})`,
            transition: `transform ${dur}s ease-in-out`,
            background: "radial-gradient(circle at 50% 40%, #7C6CFF, #22D39A)",
            opacity: 0.22,
            filter: "blur(18px)",
          }}
        />
        <div
          className="absolute inset-8 rounded-full border border-border2"
          style={{ transform: `scale(${scale})`, transition: `transform ${dur}s ease-in-out` }}
        />
        <span className="relative z-10 text-lg font-medium">{running ? cur.label : "Ready"}</span>
      </div>

      <button
        onClick={() => {
          setPhase(0);
          setRunning((r) => !r);
        }}
        className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        {running ? "Stop" : "Start breathing"}
      </button>
      <p className="mt-3 text-xs text-dim">Box breathing: in 4, hold 4, out 4, hold 4.</p>

      <p
        className="mt-12 max-w-md text-lg text-muted transition-opacity"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {QUOTES[quote]}
      </p>
    </div>
  );
}
