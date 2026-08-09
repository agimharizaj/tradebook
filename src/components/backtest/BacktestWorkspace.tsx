"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PairPicker from "@/components/PairPicker";
import AccountSwitcher from "@/components/AccountSwitcher";
import { ALL_ACCOUNTS, fetchAccounts, useSelectedAccount, type Account } from "@/lib/accounts";
import { usePairs } from "@/lib/usePairs";
import { numFromInput, withCommas } from "@/lib/format";
import {
  computeStats,
  tfSeconds,
  TIMEFRAMES,
  type BtTrade,
  type Candle,
  type Timeframe,
} from "@/lib/backtest";
import ReplayView from "@/components/backtest/ReplayView";

// Backtest home: past replay sessions plus the new-session form. Candle data
// comes from /api/candles (Twelve Data for FX/metals, Binance for crypto,
// cached in Supabase). Sessions/trades persist via migration 0021; without it
// the replay still runs, in-memory only, with a notice.

const WARMUP_BARS = 150; // context candles shown before the replay start

type SessionRow = {
  id: string;
  pair: string;
  timeframe: Timeframe;
  replay_from: string;
  replayed_to: string | null;
  name: string | null;
  strategy_id: string | null;
  strategy_name: string | null;
  starting_balance: number;
  risk_pct: number;
  status: "active" | "done";
  created_at: string;
};

type Replay = {
  sessionId: string | null;
  persisted: boolean;
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
};

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || (e.message ?? "").includes("does not exist"));

export default function BacktestWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const watchlist = usePairs().filter((p) => p.includes("/")); // indices/energy have no candle source yet

  const [uid, setUid] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [tradesBySession, setTradesBySession] = useState<Record<string, BtTrade[]>>({});
  const [strategies, setStrategies] = useState<
    { id: string; name: string; risk_per_trade_pct: string | null }[]
  >([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selAccount] = useSelectedAccount();
  const profileDefaults = useRef<{ size?: string; risk?: string }>({});
  const [tablesOk, setTablesOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);

  // New-session form.
  const [pair, setPair] = useState("EUR/USD");
  const [tf, setTf] = useState<Timeframe>("1h");
  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  }, []);
  const [date, setDate] = useState(defaultDate);
  const [strategyId, setStrategyId] = useState("");
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [name, setName] = useState("");

  useEffect(() => {
    if (watchlist.length && !watchlist.includes(pair)) setPair(watchlist[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.join("|")]);

  async function loadAll() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    setUid(user.id);
    const m = (user.user_metadata ?? {}) as Record<string, unknown>;
    if (typeof m.account_size === "string" && m.account_size) {
      profileDefaults.current.size = withCommas(m.account_size);
      setBalance(profileDefaults.current.size);
    }
    if (typeof m.default_risk_pct === "string" && m.default_risk_pct) {
      profileDefaults.current.risk = m.default_risk_pct;
      setRiskPct(m.default_risk_pct);
    }

    const [sess, strat, acc] = await Promise.all([
      supabase.from("backtest_sessions").select("*").order("created_at", { ascending: false }),
      supabase.from("strategies").select("id,name,risk_per_trade_pct").order("sort_order"),
      fetchAccounts(supabase),
    ]);
    setAccounts(acc.accounts);
    if (sess.error) {
      if (isMissingTable(sess.error)) setTablesOk(false);
    } else {
      setSessions((sess.data ?? []) as SessionRow[]);
      const { data: trades } = await supabase
        .from("backtest_trades")
        .select("*")
        .order("entered_at", { ascending: true });
      const map: Record<string, BtTrade[]> = {};
      for (const t of trades ?? []) {
        (map[t.session_id] ??= []).push(rowToTrade(t));
      }
      setTradesBySession(map);
    }
    if (!strat.error) setStrategies(strat.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selected prop-firm account prefills the balance (same pattern as the
  // risk calculator); "All accounts" falls back to the trading profile.
  const selectedAccount = useMemo(
    () => (selAccount === ALL_ACCOUNTS ? null : accounts.find((a) => a.id === selAccount) ?? null),
    [accounts, selAccount]
  );
  useEffect(() => {
    if (selectedAccount?.size != null) setBalance(withCommas(String(selectedAccount.size)));
    else if (profileDefaults.current.size) setBalance(profileDefaults.current.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  // Picking a plan pulls its risk-per-trade setting; "No plan" restores the
  // profile default.
  useEffect(() => {
    const strat = strategies.find((s) => s.id === strategyId);
    const raw = strat?.risk_per_trade_pct?.replace("%", "").trim();
    if (raw && Number.isFinite(parseFloat(raw))) setRiskPct(raw);
    else if (profileDefaults.current.risk) setRiskPct(profileDefaults.current.risk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyId]);

  async function fetchCandles(p: string, t: Timeframe, fromSec: number): Promise<Candle[]> {
    const from = new Date(fromSec * 1000).toISOString();
    const r = await fetch(`/api/candles?pair=${encodeURIComponent(p)}&tf=${t}&from=${encodeURIComponent(from)}`);
    const j = await r.json();
    if (!r.ok) {
      throw new Error(
        j?.error === "missing_key"
          ? j.message
          : j?.error === "rate_limited"
            ? "Data provider rate limit hit. Wait a minute and try again."
            : j?.error ?? "Could not load candles."
      );
    }
    return j.candles as Candle[];
  }

  async function fetchCriteria(sid: string): Promise<string[]> {
    const { data } = await supabase
      .from("entry_criteria")
      .select("content,sort_order")
      .eq("strategy_id", sid)
      .order("sort_order");
    return (data ?? []).map((r) => r.content as string);
  }

  // Shared launcher for "Start replay", and for in-replay switches of
  // pair/timeframe/date (which carry balance, risk and plan over into a
  // fresh session so stats never mix markets).
  async function launch(opts: {
    pair: string;
    tf: Timeframe;
    startTs: number;
    bal: number;
    risk: number;
    strategyId: string | null;
    strategyName: string | null;
    sessionName: string | null;
  }) {
    setError(null);
    setStarting(true);
    try {
      if (Number.isNaN(opts.startTs)) throw new Error("Pick a start date.");
      if (opts.startTs * 1000 > Date.now() - 86400000) throw new Error("Start date must be in the past.");
      const step = tfSeconds(opts.tf);
      const candles = await fetchCandles(opts.pair, opts.tf, opts.startTs - WARMUP_BARS * step);
      const startIndex = candles.findIndex((c) => c.t >= opts.startTs);
      if (startIndex < 0 || candles.length - startIndex < 30) {
        throw new Error("Not enough data after that date. Try an earlier date or a bigger timeframe.");
      }
      const criteria = opts.strategyId ? await fetchCriteria(opts.strategyId) : [];

      let sessionId: string | null = null;
      let persisted = false;
      if (tablesOk) {
        const { data: auth } = await supabase.auth.getUser();
        const { data, error: insErr } = await supabase
          .from("backtest_sessions")
          .insert({
            user_id: auth.user!.id,
            pair: opts.pair,
            timeframe: opts.tf,
            replay_from: new Date(candles[startIndex].t * 1000).toISOString(),
            name: opts.sessionName,
            strategy_id: opts.strategyId,
            strategy_name: opts.strategyName,
            starting_balance: opts.bal,
            risk_pct: opts.risk,
          })
          .select("id")
          .single();
        if (insErr) {
          if (isMissingTable(insErr)) setTablesOk(false);
        } else {
          sessionId = data.id;
          persisted = true;
        }
      }

      setReplay({
        sessionId,
        persisted,
        pair: opts.pair,
        tf: opts.tf,
        candles,
        startIndex,
        initialIndex: startIndex,
        startingBalance: opts.bal,
        riskPct: opts.risk,
        strategyId: opts.strategyId,
        strategyName: opts.strategyName,
        criteria,
        initialTrades: [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session.");
    }
    setStarting(false);
  }

  async function startSession() {
    const strat = strategies.find((s) => s.id === strategyId) ?? null;
    await launch({
      pair,
      tf,
      startTs: Math.floor(Date.parse(date + "T00:00:00Z") / 1000),
      bal: numFromInput(balance) || 10000,
      risk: parseFloat(riskPct) || 1,
      strategyId: strat?.id ?? null,
      strategyName: strat?.name ?? null,
      sessionName: name.trim() || null,
    });
  }

  // In-replay switch: relaunch with new market settings, same money settings.
  async function switchReplay(next: { pair: string; tf: Timeframe; date: string }) {
    const cur = replay;
    if (!cur) return;
    setReplay(null);
    await launch({
      pair: next.pair,
      tf: next.tf,
      startTs: Math.floor(Date.parse(next.date + "T00:00:00Z") / 1000),
      bal: cur.startingBalance,
      risk: cur.riskPct,
      strategyId: cur.strategyId,
      strategyName: cur.strategyName,
      sessionName: null,
    });
    loadAll();
  }

  async function openSession(s: SessionRow) {
    setError(null);
    setStarting(true);
    try {
      const startTs = Math.floor(Date.parse(s.replay_from) / 1000);
      const step = tfSeconds(s.timeframe);
      const candles = await fetchCandles(s.pair, s.timeframe, startTs - WARMUP_BARS * step);
      const startIndex = Math.max(0, candles.findIndex((c) => c.t >= startTs));
      const resumeTs = s.replayed_to ? Math.floor(Date.parse(s.replayed_to) / 1000) : startTs;
      let initialIndex = startIndex;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].t <= resumeTs) { initialIndex = Math.max(startIndex, i); break; }
      }
      const criteria = s.strategy_id ? await fetchCriteria(s.strategy_id) : [];
      setReplay({
        sessionId: s.id,
        persisted: true,
        pair: s.pair,
        tf: s.timeframe,
        candles,
        startIndex,
        initialIndex,
        startingBalance: Number(s.starting_balance),
        riskPct: Number(s.risk_pct),
        strategyId: s.strategy_id,
        strategyName: s.strategy_name,
        criteria,
        initialTrades: tradesBySession[s.id] ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the session.");
    }
    setStarting(false);
  }

  async function deleteSession(id: string) {
    await supabase.from("backtest_sessions").delete().eq("id", id);
    setConfirmDelete(null);
    setSessions((s) => s.filter((x) => x.id !== id));
  }

  if (replay && uid) {
    return (
      <ReplayView
        {...replay}
        uid={uid}
        watchlist={watchlist}
        onSwitch={switchReplay}
        onExit={() => {
          setReplay(null);
          loadAll();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-2xl">Backtest</h1>
      <p className="mt-1 text-muted">
        Replay historical candles bar by bar and take hypothetical trades against a plan.
        Results stay separate from your live journal.
      </p>

      {!tablesOk && (
        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          Migration 0021 is not applied yet: replays run in-memory and nothing is saved.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* New session */}
      <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">New replay session</h2>
          <AccountSwitcher />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Pair">
            <PairPicker pairs={watchlist} value={pair} onChange={setPair} className="input" />
          </Field>
          <Field label="Timeframe">
            <select value={tf} onChange={(e) => setTf(e.target.value as Timeframe)} className="input">
              {TIMEFRAMES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
            </select>
          </Field>
          <Field label="Start date (UTC)">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} />
          </Field>
          <Field label="Plan (optional)">
            <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className="input">
              <option value="">No plan</option>
              {strategies.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <Field label="Starting balance">
            <input inputMode="decimal" value={balance} onChange={(e) => setBalance(withCommas(e.target.value))} className="input" />
            {selectedAccount && (
              <span className="mt-1 block text-xs text-dim">From {selectedAccount.name}</span>
            )}
          </Field>
          <Field label="Risk % per trade">
            <input type="number" inputMode="decimal" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="input" />
          </Field>
          <Field label="Session name (optional)">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. London breakout Jan-Mar" />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={startSession}
            disabled={starting || !watchlist.length}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_rgba(106,88,240,0.35)] transition hover:opacity-90 disabled:opacity-40"
          >
            {starting ? "Loading data..." : "Start replay"}
          </button>
          <span className="text-xs text-dim">
            Loads up to 5,000 bars from the start date. Lower timeframes cover less calendar time.
          </span>
        </div>
      </div>

      {/* Past sessions */}
      <div className="mt-8">
        <h2 className="font-medium">Sessions</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No sessions yet. Start your first replay above.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => {
              const st = computeStats(tradesBySession[s.id] ?? [], Number(s.starting_balance), Number(s.risk_pct));
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.name || `${s.pair} ${s.timeframe}`}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.status === "done" ? "bg-surface2 text-muted" : "bg-accent-soft text-accent2"}`}>
                        {s.status === "done" ? "Done" : "Active"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-dim">
                      {s.pair} · {s.timeframe} · from {new Date(s.replay_from).toLocaleDateString("en-GB")}
                      {s.strategy_name ? ` · ${s.strategy_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="text-muted">{st.trades} trades</span>
                    <span className="text-muted">{st.winRate != null ? `${st.winRate.toFixed(0)}%` : "-"}</span>
                    <span className={st.totalR >= 0 ? "text-success" : "text-danger"}>
                      {st.trades ? `${st.totalR >= 0 ? "+" : ""}${st.totalR.toFixed(1)}R` : "-"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openSession(s)} className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground">
                      {s.status === "done" ? "Review" : "Resume"}
                    </button>
                    {confirmDelete === s.id ? (
                      <button onClick={() => deleteSession(s.id)} className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white">
                        Confirm
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDelete(s.id)} className="rounded-lg border border-border2 px-3 py-1.5 text-xs text-dim transition hover:border-danger hover:text-danger">
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function rowToTrade(t: Record<string, unknown>): BtTrade {
  return {
    id: String(t.id),
    direction: t.direction as "long" | "short",
    entry: Number(t.entry),
    stop: Number(t.stop),
    target: t.target != null ? Number(t.target) : null,
    exit: t.exit != null ? Number(t.exit) : null,
    enteredAt: Math.floor(Date.parse(String(t.entered_at)) / 1000),
    exitedAt: t.exited_at ? Math.floor(Date.parse(String(t.exited_at)) / 1000) : null,
    outcome: t.outcome as BtTrade["outcome"],
    r: t.r != null ? Number(t.r) : null,
    pnl: t.pnl != null ? Number(t.pnl) : null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dim">{label}</span>
      {children}
    </label>
  );
}
