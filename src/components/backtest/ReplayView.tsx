"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeStats,
  priceDecimalsFor,
  resolveTradeOnBar,
  rMultiple,
  type BtTrade,
  type Candle,
  type Timeframe,
} from "@/lib/backtest";
import ReplayChart from "@/components/backtest/ReplayChart";

// The replay screen: chart, playback controls, trade panel, live stats and
// (optionally) the selected strategy's entry checklist. PnL uses flat risk on
// the starting balance; trades persist to backtest_trades when the migration
// is applied, otherwise the session runs in-memory with a notice.

const SPEEDS = [
  { label: "0.5x", ms: 2000 },
  { label: "1x", ms: 1000 },
  { label: "2x", ms: 500 },
  { label: "5x", ms: 200 },
  { label: "10x", ms: 100 },
];

type OpenTrade = {
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number | null;
  enteredAt: number;
};

export default function ReplayView({
  uid,
  sessionId,
  pair,
  tf,
  candles,
  startIndex,
  initialIndex,
  startingBalance,
  riskPct,
  strategyName,
  criteria,
  initialTrades,
  persisted,
  onExit,
}: {
  uid: string;
  sessionId: string | null;
  pair: string;
  tf: Timeframe;
  candles: Candle[];
  startIndex: number;
  initialIndex: number;
  startingBalance: number;
  riskPct: number;
  strategyName: string | null;
  criteria: string[];
  initialTrades: BtTrade[];
  persisted: boolean;
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // index into SPEEDS
  const [openTrade, setOpenTrade] = useState<OpenTrade | null>(null);
  const [closed, setClosed] = useState<BtTrade[]>(initialTrades);
  const [ticks, setTicks] = useState<boolean[]>(criteria.map(() => false));
  const [saveError, setSaveError] = useState(false);

  // Trade form.
  const [formDir, setFormDir] = useState<"long" | "short" | null>(null);
  const [fEntry, setFEntry] = useState("");
  const [fStop, setFStop] = useState("");
  const [fTarget, setFTarget] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const bar = candles[idx];
  const decimals = priceDecimalsFor(pair);
  const atEnd = idx >= candles.length - 1;
  const stats = useMemo(
    () => computeStats(closed, startingBalance, riskPct),
    [closed, startingBalance, riskPct]
  );

  const supabase = useMemo(() => createClient(), []);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const persistTrade = useCallback(
    async (t: BtTrade) => {
      if (!persisted || !sessionId) return;
      const { error } = await supabase.from("backtest_trades").insert({
        session_id: sessionId,
        user_id: uid,
        direction: t.direction,
        entry: t.entry,
        stop: t.stop,
        target: t.target,
        exit: t.exit,
        entered_at: new Date(t.enteredAt * 1000).toISOString(),
        exited_at: t.exitedAt ? new Date(t.exitedAt * 1000).toISOString() : null,
        outcome: t.outcome,
        r: t.r,
        pnl: t.pnl,
      });
      if (error) setSaveError(true);
      // Keep the resume point close to reality (best-effort).
      supabase
        .from("backtest_sessions")
        .update({ replayed_to: new Date(candles[idxRef.current].t * 1000).toISOString() })
        .eq("id", sessionId)
        .then(() => {});
    },
    [persisted, sessionId, supabase, uid, candles]
  );

  const riskAmount = (startingBalance * riskPct) / 100;

  const closeTrade = useCallback(
    (trade: OpenTrade, exit: number, outcome: "tp" | "sl" | "manual", atBar: number) => {
      const r = rMultiple(trade.direction, trade.entry, trade.stop, exit);
      const t: BtTrade = {
        id: crypto.randomUUID(),
        direction: trade.direction,
        entry: trade.entry,
        stop: trade.stop,
        target: trade.target,
        exit,
        enteredAt: trade.enteredAt,
        exitedAt: atBar,
        outcome,
        r,
        pnl: r != null ? riskAmount * r : null,
      };
      setClosed((c) => [...c, t]);
      setOpenTrade(null);
      persistTrade(t);
    },
    [persistTrade, riskAmount]
  );

  // Advance n bars, resolving the open trade bar by bar (never skip a bar the
  // stop could have hit).
  const advance = useCallback(
    (n: number) => {
      setIdx((cur) => {
        let i = cur;
        let trade = openTrade;
        for (let s = 0; s < n && i < candles.length - 1; s++) {
          i += 1;
          if (trade) {
            const hit = resolveTradeOnBar(trade, candles[i]);
            if (hit) {
              closeTrade(trade, hit.exit, hit.outcome, candles[i].t);
              trade = null;
            }
          }
        }
        return i;
      });
    },
    [candles, openTrade, closeTrade]
  );

  // Playback timer.
  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const h = setInterval(() => advance(1), SPEEDS[speed].ms);
    return () => clearInterval(h);
  }, [playing, speed, advance, atEnd]);

  // Keyboard: space = play/pause, . or ArrowRight = step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" || e.key === ".") {
        e.preventDefault();
        advance(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  function startForm(dir: "long" | "short") {
    setFormDir(dir);
    setFEntry(bar.c.toFixed(decimals));
    setFStop("");
    setFTarget("");
    setFormError(null);
    setPlaying(false);
  }

  function placeTrade() {
    if (!formDir) return;
    const entry = parseFloat(fEntry);
    const stop = parseFloat(fStop);
    const target = fTarget.trim() ? parseFloat(fTarget) : null;
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) {
      setFormError("Entry and stop are required.");
      return;
    }
    if (formDir === "long" ? stop >= entry : stop <= entry) {
      setFormError(formDir === "long" ? "Stop must be below entry for a long." : "Stop must be above entry for a short.");
      return;
    }
    if (target != null && (formDir === "long" ? target <= entry : target >= entry)) {
      setFormError("Target is on the wrong side of entry.");
      return;
    }
    setOpenTrade({ direction: formDir, entry, stop, target, enteredAt: bar.t });
    setFormDir(null);
    setTicks(criteria.map(() => false));
  }

  async function finishSession() {
    setPlaying(false);
    if (persisted && sessionId) {
      await supabase
        .from("backtest_sessions")
        .update({
          status: "done",
          replayed_to: new Date(bar.t * 1000).toISOString(),
        })
        .eq("id", sessionId);
    }
    onExit();
  }

  async function leaveSession() {
    setPlaying(false);
    if (persisted && sessionId) {
      await supabase
        .from("backtest_sessions")
        .update({ replayed_to: new Date(bar.t * 1000).toISOString() })
        .eq("id", sessionId);
    }
    onExit();
  }

  const openR = openTrade
    ? rMultiple(openTrade.direction, openTrade.entry, openTrade.stop, bar.c)
    : null;
  const barDate = new Date(bar.t * 1000);
  const barLabel = barDate.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">
            {pair} <span className="text-base text-muted">{tf} replay</span>
          </h1>
          <p className="mt-0.5 text-xs text-dim">
            {strategyName ? `Plan: ${strategyName} · ` : ""}
            Risk {riskPct}% of {startingBalance.toLocaleString()} per trade (flat)
            {!persisted && " · not saving (apply migration 0021)"}
            {saveError && " · save failed, session continues in-memory"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={leaveSession} className="rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground">
            Save &amp; exit
          </button>
          <button onClick={finishSession} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:opacity-90">
            Finish session
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Chart + transport */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-[320px] flex-1 overflow-hidden rounded-2xl bg-card p-2 ring-1 ring-border">
            <ReplayChart candles={candles} revealIndex={idx} openTrade={openTrade} closedTrades={closed} />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={atEnd}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => advance(1)} disabled={atEnd} className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40">
              Step
            </button>
            <button onClick={() => advance(10)} disabled={atEnd} className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40">
              +10
            </button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="input !w-auto !py-2 text-sm" aria-label="Replay speed">
              {SPEEDS.map((s, i) => (<option key={s.label} value={i}>{s.label}</option>))}
            </select>
            <span className="ml-auto font-mono text-xs text-dim">
              {barLabel} UTC · bar {Math.max(0, idx - startIndex) + 1}/{candles.length - startIndex}
              {atEnd && " · end of data"}
            </span>
          </div>
        </div>

        {/* Side panel */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {/* Trade panel */}
          <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Trade</h2>
              <span className="font-mono text-sm">{bar.c.toFixed(decimals)}</span>
            </div>
            {openTrade ? (
              <div className="mt-3 space-y-2 text-sm">
                <Row k="Direction" v={openTrade.direction === "long" ? "Long" : "Short"} />
                <Row k="Entry" v={openTrade.entry.toFixed(decimals)} />
                <Row k="Stop" v={openTrade.stop.toFixed(decimals)} />
                <Row k="Target" v={openTrade.target != null ? openTrade.target.toFixed(decimals) : "none"} />
                <Row
                  k="Open R"
                  v={openR != null ? `${openR >= 0 ? "+" : ""}${openR.toFixed(2)}R` : "-"}
                  tone={openR != null ? (openR >= 0 ? "up" : "down") : undefined}
                />
                <button
                  onClick={() => closeTrade(openTrade, bar.c, "manual", bar.t)}
                  className="mt-2 w-full rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
                >
                  Close at market ({bar.c.toFixed(decimals)})
                </button>
              </div>
            ) : formDir ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-dim">{formDir === "long" ? "Long" : "Short"} at bar close (editable)</p>
                <label className="block text-xs text-dim">Entry
                  <input type="number" step="any" inputMode="decimal" value={fEntry} onChange={(e) => setFEntry(e.target.value)} className="input mt-1" />
                </label>
                <label className="block text-xs text-dim">Stop loss
                  <input type="number" step="any" inputMode="decimal" value={fStop} onChange={(e) => setFStop(e.target.value)} className="input mt-1" autoFocus />
                </label>
                <label className="block text-xs text-dim">Target (optional)
                  <input type="number" step="any" inputMode="decimal" value={fTarget} onChange={(e) => setFTarget(e.target.value)} className="input mt-1" />
                </label>
                {formError && <p className="text-xs text-danger">{formError}</p>}
                <div className="flex gap-2">
                  <button onClick={placeTrade} className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:opacity-90">Place trade</button>
                  <button onClick={() => setFormDir(null)} className="rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button onClick={() => startForm("long")} className="flex-1 rounded-lg bg-success/15 px-3 py-2 text-sm font-medium text-success ring-1 ring-success/30 transition hover:bg-success/25">
                  Long
                </button>
                <button onClick={() => startForm("short")} className="flex-1 rounded-lg bg-danger/15 px-3 py-2 text-sm font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger/25">
                  Short
                </button>
              </div>
            )}
          </div>

          {/* Entry checklist */}
          {criteria.length > 0 && (
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <h2 className="text-sm font-medium">Entry criteria</h2>
              <ul className="mt-2 space-y-1.5">
                {criteria.map((c, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        checked={ticks[i] ?? false}
                        onChange={() => setTicks((t) => t.map((v, j) => (j === i ? !v : v)))}
                        className="mt-0.5 accent-[#6A58F0]"
                      />
                      <span className={ticks[i] ? "text-foreground" : ""}>{c}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-dim">Ticks reset when you place a trade.</p>
            </div>
          )}

          {/* Stats */}
          <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <h2 className="text-sm font-medium">Session stats</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Row k="Trades" v={String(stats.trades)} />
              <Row k="Win rate" v={stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : "-"} />
              <Row k="Avg R" v={stats.avgR != null ? stats.avgR.toFixed(2) : "-"} />
              <Row k="Expectancy" v={stats.expectancyR != null ? `${stats.expectancyR.toFixed(2)}R` : "-"} />
              <Row k="Total" v={`${stats.totalR >= 0 ? "+" : ""}${stats.totalR.toFixed(1)}R`} tone={stats.totalR >= 0 ? "up" : "down"} />
              <Row
                k="PnL"
                v={`${stats.pnl >= 0 ? "+" : ""}${stats.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                tone={stats.pnl >= 0 ? "up" : "down"}
              />
            </div>
            {stats.equity.length > 2 && <EquityCurve points={stats.equity} />}
          </div>

          {/* Closed trades */}
          {closed.length > 0 && (
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <h2 className="text-sm font-medium">Closed trades</h2>
              <ul className="mt-2 space-y-1.5">
                {[...closed].reverse().map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted">
                      {t.direction === "long" ? "Long" : "Short"} @ <span className="font-mono">{t.entry.toFixed(decimals)}</span>
                      <span className="ml-1 text-dim">{t.outcome === "tp" ? "target" : t.outcome === "sl" ? "stopped" : "manual"}</span>
                    </span>
                    <span className={`font-mono ${((t.r ?? 0) >= 0 ? "text-success" : "text-danger")}`}>
                      {t.r != null ? `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R` : "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{k}</span>
      <span className={`font-mono ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}>{v}</span>
    </div>
  );
}

function EquityCurve({ points }: { points: number[] }) {
  const w = 260;
  const h = 60;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={up ? "#22D39A" : "#FF6274"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
