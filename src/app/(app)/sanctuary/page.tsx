"use client";

import { useEffect, useState } from "react";

type Phase = { label: string; dur: number; scale: number };
const PATTERNS: Record<string, { name: string; phases: Phase[] }> = {
  box: {
    name: "Box · 4-4-4-4",
    phases: [
      { label: "Breathe in", dur: 4, scale: 1 },
      { label: "Hold", dur: 4, scale: 1 },
      { label: "Breathe out", dur: 4, scale: 0.55 },
      { label: "Hold", dur: 4, scale: 0.55 },
    ],
  },
  relax: {
    name: "Relax · 4-7-8",
    phases: [
      { label: "Breathe in", dur: 4, scale: 1 },
      { label: "Hold", dur: 7, scale: 1 },
      { label: "Breathe out", dur: 8, scale: 0.55 },
    ],
  },
  calm: {
    name: "Calm · 4-6",
    phases: [
      { label: "Breathe in", dur: 4, scale: 1 },
      { label: "Breathe out", dur: 6, scale: 0.55 },
    ],
  },
};
const DURATIONS = [2, 5, 10, 15];

const QUOTES = [
  "You don't need the next trade. You need your process.",
  "Protect capital first. Your edge plays out over many trades.",
  "Bias is a plan plus invalidation, not a prediction.",
  "If invalidation hits, reset. No coping, no revenge trade.",
  "Consistency comes from calm, repeatable execution.",
  "You are not your last trade.",
];

function mmss(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function SanctuaryPage() {
  const [patternKey, setPatternKey] = useState("box");
  const [durationMin, setDurationMin] = useState(5);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [quote, setQuote] = useState(0);

  const pattern = PATTERNS[patternKey];

  // Phase cycle
  useEffect(() => {
    if (!running) return;
    const p = pattern.phases[phase];
    const t = setTimeout(() => setPhase((x) => (x + 1) % pattern.phases.length), p.dur * 1000);
    return () => clearTimeout(t);
  }, [running, phase, pattern]);

  // Countdown
  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [running, remaining]);

  useEffect(() => {
    const i = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 9000);
    return () => clearInterval(i);
  }, []);

  function start() {
    setPhase(0);
    setRemaining(durationMin * 60);
    setRunning(true);
  }

  const cur = pattern.phases[phase];
  const scale = running ? cur.scale : 0.7;
  const dur = running ? cur.dur : 0.6;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-2xl">Calm</h1>
      <p className="mt-1 text-muted">A moment to reset before or after the session.</p>

      {!running && (
        <>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {Object.entries(PATTERNS).map(([k, p]) => (
              <button
                key={k}
                onClick={() => setPatternKey(k)}
                className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                  patternKey === k ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDurationMin(d)}
                className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                  durationMin === d ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted"
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </>
      )}

      <div className="relative my-10 flex h-64 w-64 items-center justify-center">
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
        <div className="relative z-10 flex flex-col items-center">
          <span className="text-lg font-medium">{running ? cur.label : "Ready"}</span>
          {running && (
            <span className="mt-1 font-mono text-sm text-muted">{mmss(remaining)}</span>
          )}
        </div>
      </div>

      <button
        onClick={() => (running ? setRunning(false) : start())}
        className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        {running ? "Stop" : `Start ${durationMin} min`}
      </button>

      <p className="mt-10 max-w-md text-lg text-muted" style={{ fontFamily: "var(--font-display)" }}>
        {QUOTES[quote]}
      </p>
    </div>
  );
}
