"use client";

import { useEffect, useRef, useState } from "react";

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
  const [sound, setSound] = useState(true);

  const pattern = PATTERNS[patternKey];

  useEffect(() => {
    setSound(localStorage.getItem("tb_calm_sound") !== "0");
  }, []);
  function toggleSound() {
    setSound((s) => {
      const next = !s;
      localStorage.setItem("tb_calm_sound", next ? "1" : "0");
      if (!next) stopAudio();
      else if (running) startAudio();
      return next;
    });
  }

  // ---- Meditation sound: generated with Web Audio, no audio files. ----
  // A soft wave-like bed (filtered brown noise with a slow swell) plus a
  // gentle tone on each breath-phase change.
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);

  function startAudio() {
    if (audioRef.current) return;
    try {
      const ctx = new AudioContext();
      // iOS creates contexts suspended even inside a gesture; resume explicitly.
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      // Fade the bed in over 2s.
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);

      // Brown noise loop (ocean-ish when lowpassed).
      const seconds = 4;
      const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      filter.Q.value = 0.4;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.12;

      // Slow swell so the bed breathes rather than hisses statically.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08; // one swell every ~12s
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(master);
      noise.start();
      lfo.start();

      audioRef.current = { ctx, master };
    } catch {
      // Audio unavailable (permissions/old browser): breathe silently.
    }
  }

  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    audioRef.current = null;
    try {
      a.master.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.6);
      setTimeout(() => a.ctx.close().catch(() => {}), 800);
    } catch {
      a.ctx.close().catch(() => {});
    }
  }

  // Soft tone marking each phase: rising for inhale, falling for exhale,
  // neutral for holds.
  function chime(label: string) {
    const a = audioRef.current;
    if (!a) return;
    try {
      const freq = label.includes("in") ? 523.25 : label.includes("out") ? 392 : 440;
      const osc = a.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = a.ctx.createGain();
      const t = a.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(g);
      g.connect(a.master);
      osc.start(t);
      osc.stop(t + 1.5);
    } catch {
      // ignore
    }
  }

  // Stop the bed whenever the session ends (Stop button or timer done).
  useEffect(() => {
    if (!running) stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  useEffect(() => () => stopAudio(), []);

  // Chime on each phase change while running.
  useEffect(() => {
    if (running && sound) chime(pattern.phases[phase].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase]);

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
    // AudioContext must be created inside a user gesture (iOS requirement).
    if (sound) startAudio();
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
            // Pure radial fade: filter blur() renders with square edges on
            // iOS Safari, which showed as a box around the circle.
            background:
              "radial-gradient(circle, rgba(124,108,255,0.30) 0%, rgba(34,211,154,0.16) 45%, rgba(34,211,154,0) 70%)",
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

      <div className="flex items-center gap-2">
        <button
          onClick={() => (running ? setRunning(false) : start())}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {running ? "Stop" : `Start ${durationMin} min`}
        </button>
        <button
          onClick={toggleSound}
          aria-pressed={sound}
          title={sound ? "Sound on" : "Sound off"}
          className={`rounded-lg border px-4 py-2.5 text-sm transition ${
            sound ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted hover:text-foreground"
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>{sound ? "Sound on" : "Sound off"}</span>
        </button>
      </div>

      <p className="mt-10 max-w-md text-lg text-muted" style={{ fontFamily: "var(--font-display)" }}>
        {QUOTES[quote]}
      </p>
    </div>
  );
}
