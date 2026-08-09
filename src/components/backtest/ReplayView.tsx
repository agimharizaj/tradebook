"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeStats,
  priceDecimalsFor,
  resolveTradeOnBar,
  rMultiple,
  TIMEFRAMES,
  type BtTrade,
  type Candle,
  type Timeframe,
} from "@/lib/backtest";
import ReplayChart from "@/components/backtest/ReplayChart";
import PairPicker from "@/components/PairPicker";
import { sizeFromRisk, quoteCurrency, isCrypto } from "@/lib/risk";

// The replay screen: chart, playback controls, trade panel, live stats and
// (optionally) the selected strategy's entry checklist. PnL uses flat risk on
// the starting balance; trades persist to backtest_trades when the migration
// is applied, otherwise the session runs in-memory with a notice.

// step > 1 advances several bars per tick (timers below ~50ms are unreliable
// in browsers, so raw interval speed tops out around 20x). advance() still
// resolves the open trade bar by bar, so no stop hit is ever skipped.
const SPEEDS = [
  { label: "0.5x", ms: 2000, step: 1 },
  { label: "1x", ms: 1000, step: 1 },
  { label: "2x", ms: 500, step: 1 },
  { label: "5x", ms: 200, step: 1 },
  { label: "10x", ms: 100, step: 1 },
  { label: "20x", ms: 50, step: 1 },
  { label: "50x", ms: 100, step: 5 },
];

// Bar-time display helpers. All bar times are UTC bar OPENS, so a trade's
// duration is measured open-bar to close-bar - the finest granularity the
// replay has.
function fmtBarTime(ts: number) {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}

function fmtDuration(secs: number) {
  if (secs < 60) return "<1m";
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

type OpenTrade = {
  direction: "long" | "short";
  entry: number;
  stop: number; // CURRENT stop - movable mid-trade (breakeven, trailing)
  initialStop: number; // stop at entry - the risk basis all R math uses
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
  strategyId,
  strategyName,
  criteria,
  initialTrades,
  persisted,
  notSavingNote,
  canSaveLater,
  watchlist,
  onSwitch,
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
  strategyId: string | null;
  strategyName: string | null;
  criteria: string[];
  initialTrades: BtTrade[];
  persisted: boolean;
  notSavingNote: string | null;
  canSaveLater: boolean;
  watchlist: string[];
  onSwitch: (next: { pair: string; tf: Timeframe; date: string }) => void;
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // index into SPEEDS
  const [openTrade, setOpenTrade] = useState<OpenTrade | null>(null);
  const [closed, setClosed] = useState<BtTrade[]>(initialTrades);
  const [ticks, setTicks] = useState<boolean[]>(criteria.map(() => false));
  const [saveError, setSaveError] = useState(false);
  // A practice run can be promoted to a saved session mid-replay ("Save
  // session" in the header): these shadow the persisted/sessionId props from
  // that moment on.
  const [live, setLive] = useState({ persisted, sessionId });
  const [savedNote, setSavedNote] = useState<string | null>(notSavingNote);
  const [savingSession, setSavingSession] = useState(false);

  // In-replay switch controls (pair / timeframe / start date). Changing them
  // relaunches as a NEW session so one session never mixes markets.
  const origDate = new Date(candles[startIndex].t * 1000).toISOString().slice(0, 10);
  const [selPair, setSelPair] = useState(pair);
  const [selTf, setSelTf] = useState<Timeframe>(tf);
  const [selDate, setSelDate] = useState(origDate);
  const switchDirty = selPair !== pair || selTf !== tf || selDate !== origDate;

  // Trade form.
  const [formDir, setFormDir] = useState<"long" | "short" | null>(null);
  const [fEntry, setFEntry] = useState("");
  const [fStop, setFStop] = useState("");
  const [fTarget, setFTarget] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Which field a chart click fills. Stop is armed first: entry is already
  // prefilled with the bar close.
  const [armed, setArmed] = useState<"entry" | "stop" | "target">("stop");

  // Mid-trade stop editing (trailing / breakeven).
  const [editStop, setEditStop] = useState("");
  const [stopError, setStopError] = useState<string | null>(null);

  // Hide the Sidekick dock bar while replaying - it overlaps the transport
  // controls and gets in the way of the work (body[data-replay] in globals.css).
  useEffect(() => {
    document.body.dataset.replay = "1";
    return () => {
      delete document.body.dataset.replay;
    };
  }, []);

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
      if (!live.persisted || !live.sessionId) return;
      const { error } = await supabase.from("backtest_trades").insert({
        session_id: live.sessionId,
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
        .eq("id", live.sessionId)
        .then(() => {});
    },
    [live, supabase, uid, candles]
  );

  const riskAmount = (startingBalance * riskPct) / 100;

  // Position size for an entry/stop at the session's flat risk, via the same
  // math as the risk calculator. Replay has no historical FX conversion, so
  // this assumes the account is denominated in the pair's QUOTE currency -
  // exact for a USD account on */USD pairs, approximate otherwise.
  const lotsFor = useCallback(
    (entry: number, stop: number) =>
      sizeFromRisk({ accountSize: startingBalance, riskPct, entry, stop, pair, conversion: 1 }),
    [startingBalance, riskPct, pair]
  );
  const sizeUnit = isCrypto(pair) ? pair.split("/")[0] : "lots";
  const fmtMoney = (n: number) =>
    `${n >= 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 })}`;

  const closeTrade = useCallback(
    (trade: OpenTrade, exit: number, outcome: "tp" | "sl" | "manual", atBar: number) => {
      // R is always measured against the INITIAL stop: that's the distance the
      // position was sized on. A stop trailed to breakeven exits at 0R, a
      // trailed runner keeps its true R.
      const r = rMultiple(trade.direction, trade.entry, trade.initialStop, exit);
      const t: BtTrade = {
        id: crypto.randomUUID(),
        direction: trade.direction,
        entry: trade.entry,
        stop: trade.initialStop,
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
    const h = setInterval(() => advance(SPEEDS[speed].step), SPEEDS[speed].ms);
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

  // Keep the stop input in sync with the open trade (placement, hits, edits).
  useEffect(() => {
    setEditStop(openTrade ? openTrade.stop.toFixed(decimals) : "");
    setStopError(null);
  }, [openTrade, decimals]);

  // Move the current stop. Only rule: it can't be on the triggering side of
  // the current close (it would fire instantly). Beyond entry is fine -
  // that's the whole point of trailing.
  function moveStop(v: number) {
    if (!openTrade) return;
    const invalid =
      !Number.isFinite(v) || (openTrade.direction === "long" ? v >= bar.c : v <= bar.c);
    if (invalid) {
      setStopError(
        openTrade.direction === "long"
          ? "Stop must stay below the current price."
          : "Stop must stay above the current price."
      );
      setEditStop(openTrade.stop.toFixed(decimals));
      return;
    }
    setStopError(null);
    setOpenTrade({ ...openTrade, stop: v });
  }

  function startForm(dir: "long" | "short") {
    setFormDir(dir);
    setFEntry(bar.c.toFixed(decimals));
    setFStop("");
    setFTarget("");
    setFormError(null);
    setArmed("stop");
    setPlaying(false);
  }

  // Chart click while the form is open: fill the armed field, then arm the
  // next empty one (stop, then target).
  function pickPrice(price: number) {
    if (!formDir) return;
    const v = price.toFixed(decimals);
    if (armed === "entry") {
      setFEntry(v);
      setArmed("stop");
    } else if (armed === "stop") {
      setFStop(v);
      setArmed("target");
    } else {
      setFTarget(v);
    }
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
    setOpenTrade({ direction: formDir, entry, stop, initialStop: stop, target, enteredAt: bar.t });
    setFormDir(null);
    setTicks(criteria.map(() => false));
  }

  // Promote a practice run to a saved session: create the session row, then
  // bulk-insert every trade closed so far. From here on persistTrade saves
  // new trades as they close, exactly like a session saved from the start.
  async function saveSessionNow() {
    if (live.persisted || savingSession) return;
    setSavingSession(true);
    try {
      const { data, error } = await supabase
        .from("backtest_sessions")
        .insert({
          user_id: uid,
          pair,
          timeframe: tf,
          replay_from: new Date(candles[startIndex].t * 1000).toISOString(),
          name: null,
          strategy_id: strategyId,
          strategy_name: strategyName,
          starting_balance: startingBalance,
          risk_pct: riskPct,
          replayed_to: new Date(bar.t * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("insert failed");
      if (closed.length > 0) {
        const { error: tErr } = await supabase.from("backtest_trades").insert(
          closed.map((t) => ({
            session_id: data.id,
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
          }))
        );
        if (tErr) throw tErr;
      }
      setLive({ persisted: true, sessionId: data.id });
      setSavedNote(null);
    } catch {
      setSaveError(true);
    }
    setSavingSession(false);
  }

  async function finishSession() {
    setPlaying(false);
    if (live.persisted && live.sessionId) {
      await supabase
        .from("backtest_sessions")
        .update({
          status: "done",
          replayed_to: new Date(bar.t * 1000).toISOString(),
        })
        .eq("id", live.sessionId);
    }
    onExit();
  }

  async function leaveSession() {
    setPlaying(false);
    if (live.persisted && live.sessionId) {
      await supabase
        .from("backtest_sessions")
        .update({ replayed_to: new Date(bar.t * 1000).toISOString() })
        .eq("id", live.sessionId);
    }
    onExit();
  }

  const openR = openTrade
    ? rMultiple(openTrade.direction, openTrade.entry, openTrade.initialStop, bar.c)
    : null;
  const barDate = new Date(bar.t * 1000);
  const barLabel = barDate.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });

  return (
    // Mobile: a normal scrolling page (fixed-height chart, panels stack
    // below). Desktop (lg+): viewport-locked two-column layout.
    <div className="flex flex-col gap-4 px-4 py-6 md:px-8 lg:h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">
            {pair} <span className="text-base text-muted">{tf} replay</span>
          </h1>
          <p className="mt-0.5 text-xs text-dim">
            {strategyName ? `Plan: ${strategyName} · ` : ""}
            Risk {riskPct}% of {startingBalance.toLocaleString()} per trade (flat)
            {savedNote && ` · ${savedNote}`}
            {saveError && " · save failed, session continues in-memory"}
          </p>
        </div>
        <div className="flex gap-2">
          {!live.persisted && canSaveLater && (
            <button
              onClick={saveSessionNow}
              disabled={savingSession}
              title="Turn this practice run into a saved session: everything traded so far is stored, and it keeps saving from here on"
              className="rounded-lg border border-accent/60 px-3 py-2 text-xs text-accent2 transition hover:border-accent hover:text-foreground disabled:opacity-40"
            >
              {savingSession ? "Saving..." : "Save session"}
            </button>
          )}
          <button
            onClick={leaveSession}
            title={live.persisted ? "Save progress and go back to the session list" : "Back to the session list (practice run, nothing is stored)"}
            className="rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            {live.persisted ? "Save & exit" : "Exit"}
          </button>
          <button onClick={finishSession} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:opacity-90">
            Finish session
          </button>
        </div>
      </div>

      {/* Quick switch: pair / timeframe / date. Applies as a fresh session. */}
      <div className="flex flex-wrap items-center gap-2">
        <PairPicker pairs={watchlist} value={selPair} onChange={setSelPair} className="input !w-44 !py-1.5 text-sm" />
        <select value={selTf} onChange={(e) => setSelTf(e.target.value as Timeframe)} className="input !w-auto !py-1.5 text-sm" aria-label="Timeframe">
          {TIMEFRAMES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
        </select>
        <input
          type="date"
          value={selDate}
          onChange={(e) => setSelDate(e.target.value)}
          max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)}
          className="input !w-auto !py-1.5 text-sm"
          aria-label="Start date (UTC)"
        />
        {switchDirty && (
          <>
            <button
              onClick={async () => {
                if (openTrade) return;
                setPlaying(false);
                if (live.persisted && live.sessionId) {
                  await supabase
                    .from("backtest_sessions")
                    .update({ replayed_to: new Date(bar.t * 1000).toISOString() })
                    .eq("id", live.sessionId);
                }
                onSwitch({ pair: selPair, tf: selTf, date: selDate });
              }}
              disabled={!!openTrade}
              title={openTrade ? "Close the open trade first" : undefined}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Restart with changes
            </button>
            <button
              onClick={() => { setSelPair(pair); setSelTf(tf); setSelDate(origDate); }}
              className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
            >
              Reset
            </button>
            {openTrade && <span className="text-xs text-dim">Close the open trade first</span>}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_300px]">
        {/* Chart + transport */}
        <div className="flex flex-col gap-3 lg:min-h-0">
          <div className="h-[45vh] min-h-[280px] overflow-hidden rounded-2xl bg-card p-2 ring-1 ring-border lg:h-auto lg:min-h-[320px] lg:flex-1">
            <ReplayChart
              candles={candles}
              revealIndex={idx}
              openTrade={openTrade}
              closedTrades={closed}
              onPriceClick={formDir ? pickPrice : undefined}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={atEnd}
              title="Play/pause the replay (Space)"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => advance(1)} disabled={atEnd} title="Advance one candle (ArrowRight or .)" className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40">
              Step
            </button>
            <button onClick={() => advance(10)} disabled={atEnd} title="Advance 10 candles at once" className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40">
              +10
            </button>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="input !w-auto !py-2 text-sm"
              aria-label="Replay speed"
              title="Playback speed in candles per second (1x = 1 candle/s). 50x moves 5 candles at a time; stops and targets are still checked on every candle"
            >
              {SPEEDS.map((s, i) => (<option key={s.label} value={i}>{s.label}</option>))}
            </select>
            <input
              type="range"
              min={startIndex}
              max={candles.length - 1}
              value={idx}
              onChange={(e) => {
                if (openTrade) return;
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              disabled={!!openTrade}
              title={openTrade ? "Locked while a trade is open" : "Drag to jump through the data"}
              className="min-w-[120px] flex-1 accent-[#6A58F0] disabled:opacity-40"
              aria-label="Replay position"
            />
            <span className="ml-auto font-mono text-xs text-dim">
              {barLabel} UTC · bar {Math.max(0, idx - startIndex) + 1}/{candles.length - startIndex}
              {atEnd && " · end of data"}
            </span>
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
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
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Stop</span>
                  <span className="flex items-center gap-1.5">
                    {openTrade.stop !== openTrade.initialStop && (
                      <span className="text-[10px] text-dim">was {openTrade.initialStop.toFixed(decimals)}</span>
                    )}
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={editStop}
                      onChange={(e) => setEditStop(e.target.value)}
                      onBlur={() => moveStop(parseFloat(editStop))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      title="Movable mid-trade (trailing / breakeven). R stays measured against the original stop"
                      aria-label="Stop (movable mid-trade)"
                      className="input !w-28 !py-1 text-right font-mono !text-sm"
                    />
                    <button
                      onClick={() => moveStop(openTrade.entry)}
                      disabled={openTrade.direction === "long" ? bar.c <= openTrade.entry : bar.c >= openTrade.entry}
                      title="Move stop to breakeven (entry price)"
                      className="rounded border border-border2 px-1.5 py-1.5 text-[10px] text-muted transition hover:border-accent hover:text-foreground disabled:opacity-40"
                    >
                      BE
                    </button>
                  </span>
                </div>
                {stopError && <p className="text-xs text-danger">{stopError}</p>}
                <Row k="Target" v={openTrade.target != null ? openTrade.target.toFixed(decimals) : "none"} />
                {(() => {
                  const sz = lotsFor(openTrade.entry, openTrade.initialStop);
                  return sz ? (
                    <Row k="Size" v={`${sz.lots > 0 ? sz.lots.toFixed(2) : "<0.01"} ${sizeUnit}`} />
                  ) : null;
                })()}
                <Row k="Risk" v={riskAmount.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
                <Row k="Opened" v={`${fmtBarTime(openTrade.enteredAt)} UTC`} />
                <Row k="Held" v={fmtDuration(bar.t - openTrade.enteredAt)} />
                <Row
                  k="Open R"
                  v={openR != null ? `${openR >= 0 ? "+" : ""}${openR.toFixed(2)}R` : "-"}
                  tone={openR != null ? (openR >= 0 ? "up" : "down") : undefined}
                />
                <Row
                  k="Open PnL"
                  v={openR != null ? fmtMoney(riskAmount * openR) : "-"}
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
                <p className="text-xs text-accent2">
                  Click the chart to set {armed === "entry" ? "Entry" : armed === "stop" ? "Stop loss" : "Target"}
                </p>
                <label className="block text-xs text-dim">Entry
                  <input type="number" step="any" inputMode="decimal" value={fEntry} onChange={(e) => setFEntry(e.target.value)} onFocus={() => setArmed("entry")} className={`input mt-1 ${armed === "entry" ? "!border-accent" : ""}`} />
                </label>
                <label className="block text-xs text-dim">Stop loss
                  <input type="number" step="any" inputMode="decimal" value={fStop} onChange={(e) => setFStop(e.target.value)} onFocus={() => setArmed("stop")} className={`input mt-1 ${armed === "stop" ? "!border-accent" : ""}`} autoFocus />
                </label>
                <label className="block text-xs text-dim">Target (optional)
                  <input type="number" step="any" inputMode="decimal" value={fTarget} onChange={(e) => setFTarget(e.target.value)} onFocus={() => setArmed("target")} className={`input mt-1 ${armed === "target" ? "!border-accent" : ""}`} />
                </label>
                {(() => {
                  const e = parseFloat(fEntry);
                  const s = parseFloat(fStop);
                  if (!Number.isFinite(e) || !Number.isFinite(s)) return null;
                  if (formDir === "long" ? s >= e : s <= e) return null;
                  const sz = lotsFor(e, s);
                  if (!sz) return null;
                  return (
                    <p className="text-xs text-dim">
                      Size{" "}
                      <span className="font-mono text-foreground">
                        {sz.lots > 0 ? sz.lots.toFixed(2) : "<0.01"} {sizeUnit}
                      </span>{" "}
                      risking{" "}
                      <span className="font-mono text-foreground">
                        {riskAmount.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                      {" "}(assumes a {quoteCurrency(pair)} account)
                    </p>
                  );
                })()}
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
              <Row k="Market time" v={fmtDuration(bar.t - candles[startIndex].t)} />
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
              <ul className="mt-2 space-y-2.5">
                {[...closed].reverse().map((t) => (
                  <li key={t.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">
                        {t.direction === "long" ? "Long" : "Short"} @ <span className="font-mono">{t.entry.toFixed(decimals)}</span>
                        <span className="ml-1 text-dim">{t.outcome === "tp" ? "target" : t.outcome === "sl" ? "stopped" : "manual"}</span>
                      </span>
                      <span className={`font-mono ${((t.r ?? 0) >= 0 ? "text-success" : "text-danger")}`}>
                        {t.r != null ? `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R` : "-"}
                        {t.pnl != null && <span className="ml-1.5 text-dim">{fmtMoney(t.pnl)}</span>}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-dim">
                      <span className="font-mono">
                        {fmtBarTime(t.enteredAt)}
                        {t.exitedAt != null && ` to ${fmtBarTime(t.exitedAt)}`} UTC
                      </span>
                      {t.exitedAt != null && (
                        <span className="font-mono">{fmtDuration(t.exitedAt - t.enteredAt)}</span>
                      )}
                    </div>
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
