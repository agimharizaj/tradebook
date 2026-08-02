"use client";

// First-login coach-marks tour. A spotlight ring highlights each nav stop
// while a card explains it; skippable at any step and replayable from
// Settings -> Tutorial & help (which dispatches "tb:start-tour"). The
// done-flag lives in user_settings (migration 0016); without that table the
// tour never auto-starts (no way to remember it was dismissed) but manual
// replay still works.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchSettings, saveSettings } from "@/lib/settings";

type Step = { target: string | null; title: string; body: string };

const STEPS: Step[] = [
  {
    target: null,
    title: "Welcome to Tradebook",
    body: "Your strategy playbooks, journal, risk engine and AI sidekick in one terminal. This tour takes about a minute - skip it any time.",
  },
  {
    target: "nav-dashboard",
    title: "Dashboard",
    body: "Equity curve, profit factor, drawdown and day-of-week stats, all drawn from your own trades. It fills up as you log.",
  },
  {
    target: "nav-strategy",
    title: "Strategy",
    body: "Write each setup as a tickable playbook: charting process, entry and exit criteria, management rules. If the boxes aren't ticked, it's not your trade.",
  },
  {
    target: "nav-journal",
    title: "Journal",
    body: "Every trade lands on this calendar. Click a day for stats, guardrails and your routine - then journal each trade with charts, tags and emotions.",
  },
  {
    target: "nav-risk",
    title: "Risk",
    body: "Stop distance in, lot size out, with live prices. Size the position before the trade exists.",
  },
  {
    target: "nav-charts",
    title: "Charts",
    body: "TradingView with your watchlist, plus the trading-day panel: pre-market routine, live guardrails and today's trades beside the chart.",
  },
  {
    target: "nav-sidekick",
    title: "Sidekick",
    body: "An AI that has read your journal, strategies and notes. Ask for chart reads, setup checks against your own rules, or where the money leaks.",
  },
  {
    target: "settings",
    title: "Settings",
    body: "Guardrails, pre-market routine, trading pairs and appearance live here. Set your account size and limits first - most pages read them.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(name: string): Rect | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

export default function TutorialTour() {
  const supabase = createClient();
  const [active, setActive] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Auto-start on first login.
  useEffect(() => {
    fetchSettings(supabase).then(({ settings, available }) => {
      setCanPersist(available);
      if (available && !settings.tutorial_done) {
        setStep(0);
        setActive(true);
      }
    });
    const onReplay = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("tb:start-tour", onReplay);
    return () => window.removeEventListener("tb:start-tour", onReplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const measure = useCallback(() => {
    const s = STEPS[step];
    setRect(s.target ? findTarget(s.target) : null);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, measure]);

  const finish = useCallback(() => {
    setActive(false);
    if (canPersist) saveSettings(supabase, { tutorial_done: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPersist]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // Card placement: beside the spotlight when there is one, centered otherwise.
  const cardStyle: React.CSSProperties = {};
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(320, vw - 24);
    if (rect.left + rect.width + cardW + 24 < vw) {
      // to the right of the target (desktop sidebar)
      cardStyle.left = rect.left + rect.width + 14;
      cardStyle.top = Math.max(12, Math.min(rect.top - 8, vh - 220));
    } else {
      // above the target (mobile bottom tabs)
      cardStyle.left = Math.max(12, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 12));
      cardStyle.bottom = vh - rect.top + 14;
    }
    cardStyle.width = cardW;
  } else {
    cardStyle.left = "50%";
    cardStyle.top = "50%";
    cardStyle.transform = "translate(-50%, -50%)";
    cardStyle.width = Math.min(360, (typeof window !== "undefined" ? window.innerWidth : 400) - 24);
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tradebook tour">
      {/* Spotlight: the ring's giant shadow doubles as the dim overlay. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: rect.top - 5,
            left: rect.left - 5,
            width: rect.width + 10,
            height: rect.height + 10,
            boxShadow: "0 0 0 9999px rgba(10, 12, 17, 0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(10,12,17,0.72)]" onClick={finish} />
      )}

      <div
        className="absolute rounded-2xl border border-border2 bg-card p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="font-mono text-[10px] uppercase tracking-widest text-accent2">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 className="mt-1.5 text-base font-medium" style={{ fontFamily: "var(--font-display)" }}>
          {s.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-accent2" : "bg-surface2"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={finish}
              className="rounded-lg px-3 py-1.5 text-xs text-dim transition hover:text-foreground"
            >
              Skip tour
            </button>
            {step > 0 && (
              <button
                onClick={() => setStep((x) => x - 1)}
                className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? finish() : setStep((x) => x + 1))}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
            >
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
