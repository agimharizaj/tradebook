"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { moneySigned, sym } from "@/lib/format";
import { usePairs } from "@/lib/usePairs";
import ImportTradesModal from "./ImportTradesModal";

type Trade = {
  id: string;
  traded_on: string;
  pair: string | null;
  direction: string | null;
  entry_price: number | null;
  stop_price: number | null;
  exit_price: number | null;
  size_lots: number | null;
  pnl: number | null;
  r_multiple: number | null;
  emotion: string | null;
  notes: string | null;
  strategy_id: string | null;
};
type Strat = { id: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// First day of the following month, for half-open date range queries that
// work whether traded_on is a date or a timestamp.
const nextMonthStart = (y: number, m: number) => {
  const d = new Date(y, m + 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};
// traded_on may be a date ("2026-07-25") or a timestamp; day key is the date part.
const dayKey = (tradedOn: string) => tradedOn.slice(0, 10);
// Phone calendar cells are ~40px wide; "1.2k" fits where "1,234" cannot.
function compactMoney(net: number) {
  const abs = Math.abs(net);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(abs));
}
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function computeStats(trades: Trade[]) {
  const withPnl = trades.filter((t) => t.pnl != null) as (Trade & { pnl: number })[];
  const wins = withPnl.filter((t) => t.pnl > 0);
  const losses = withPnl.filter((t) => t.pnl < 0);
  const net = withPnl.reduce((s, t) => s + t.pnl, 0);
  const decided = wins.length + losses.length;
  const rs = trades.filter((t) => t.r_multiple != null).map((t) => t.r_multiple as number);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  // True expectancy: win% x avg win - loss% x avg loss, over decided trades.
  // avgLoss is negative here, so this reduces to a weighted sum.
  const expectancy = decided
    ? (wins.length / decided) * avgWin + (losses.length / decided) * avgLoss
    : 0;
  return {
    total: trades.length,
    winRate: decided ? (wins.length / decided) * 100 : 0,
    net,
    avgWin,
    avgLoss,
    best: withPnl.length ? Math.max(...withPnl.map((t) => t.pnl)) : 0,
    worst: withPnl.length ? Math.min(...withPnl.map((t) => t.pnl)) : 0,
    expectancy,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
  };
}

export default function JournalWorkspace() {
  const supabase = createClient();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strat[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cur, setCur] = useState("USD");
  const [accSize, setAccSize] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const start = `${cursor.y}-${pad(cursor.m + 1)}-01`;
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .gte("traded_on", start)
      .lt("traded_on", nextMonthStart(cursor.y, cursor.m))
      .order("traded_on", { ascending: true });
    setLoadError(error ? `Could not load trades: ${error.message}` : null);
    setTrades((data as Trade[]) ?? []);
    setLoading(false);
  }, [supabase, cursor]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("strategies")
      .select("id, name")
      .then(({ data }) => setStrategies((data as Strat[]) ?? []));
    supabase.auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata ?? {};
      const c = m.account_currency;
      if (typeof c === "string" && c) setCur(c);
      const s = parseFloat(m.account_size);
      if (!Number.isNaN(s) && s > 0) setAccSize(s);
    });
  }, [supabase]);

  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(cursor.y, cursor.m, 1 - offset);
    const w: Date[][] = [];
    for (let r = 0; r < 6; r++) {
      const row: Date[] = [];
      for (let c = 0; c < 7; c++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + r * 7 + c);
        row.push(d);
      }
      w.push(row);
    }
    return w;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map: Record<string, Trade[]> = {};
    trades.forEach((t) => {
      (map[dayKey(t.traded_on)] ||= []).push(t);
    });
    return map;
  }, [trades]);

  const stats = useMemo(() => computeStats(trades), [trades]);
  const dayTrades = selectedDay ? byDay[selectedDay] ?? [] : [];

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  async function deleteTrade(id: string) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) setLoadError(`Could not delete trade: ${error.message}`);
    load();
  }

  const todayStr = ymd(now);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl">Journal</h1>
          <p className="mt-1 text-muted">
            Review your trades, emotions, and patterns to build consistency.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
          >
            Import MT5
          </button>
          <button
            onClick={() => setSelectedDay(todayStr)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Add trade
          </button>
        </div>
      </div>

      {loadError && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {loadError}
        </p>
      )}

      <div className="rounded-2xl bg-card p-2.5 ring-1 ring-border md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => shift(-1)} className="rounded-md border border-border2 px-3 py-2 text-sm text-muted hover:text-foreground" aria-label="Previous month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
            <span className="text-lg font-medium" style={{ fontFamily: "var(--font-display)" }}>
              {MONTHS[cursor.m]} {cursor.y}
            </span>
            <button onClick={() => shift(1)} className="rounded-md border border-border2 px-3 py-2 text-sm text-muted hover:text-foreground" aria-label="Next month"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button>
          </div>
          <button
            onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
            className="rounded-md border border-border2 px-3 py-2 text-xs text-muted hover:text-foreground"
          >
            This month
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
          {DOW.map((d) => (
            <div key={d} className="pb-1 text-center text-xs text-dim">{d}</div>
          ))}
          {weeks.flat().map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === cursor.m;
            const dayTradesCell = byDay[key] ?? [];
            const net = dayTradesCell.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const has = dayTradesCell.length > 0;
            const win = net > 0;
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`flex h-12 flex-col overflow-hidden rounded-md border p-1 text-left transition hover:border-accent md:h-24 md:rounded-lg md:p-2 ${
                  has
                    ? win
                      ? "border-success/40 bg-success/10"
                      : net < 0
                        ? "border-danger/40 bg-danger/10"
                        : "border-border"
                    : "border-border"
                } ${inMonth ? "" : "opacity-40"} ${key === todayStr ? "ring-1 ring-accent" : ""}`}
              >
                <span className="text-xs text-dim">{d.getDate()}</span>
                {has && (
                  <span className="mt-auto block min-w-0">
                    <span className="hidden text-[11px] text-muted md:block">
                      {dayTradesCell.length} {dayTradesCell.length === 1 ? "trade" : "trades"}
                    </span>
                    <span
                      className={`block truncate text-[10px] font-medium md:text-xs ${win ? "text-success" : net < 0 ? "text-danger" : "text-muted"}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      <span className="md:hidden">
                        {`${net > 0 ? "+" : net < 0 ? "-" : ""}${sym(cur)}${compactMoney(net)}`}
                      </span>
                      <span className="hidden md:inline">{moneySigned(net, cur)}</span>
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Monthly summary
          </h2>
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Net PnL" value={moneySigned(stats.net, cur)} tone={stats.net >= 0 ? "up" : "down"} />
              <Metric
                label="Account growth"
                value={accSize ? `${stats.net >= 0 ? "+" : ""}${((stats.net / accSize) * 100).toFixed(2)}%` : "—"}
                tone={stats.net >= 0 ? "up" : "down"}
              />
              <Metric label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
              <Metric label="Total trades" value={String(stats.total)} />
              <Metric
                label="Expectancy / trade"
                value={moneySigned(stats.expectancy, cur)}
                tone={stats.expectancy >= 0 ? "up" : "down"}
              />
              <Metric label="Avg R" value={stats.avgR == null ? "—" : `${stats.avgR.toFixed(2)}R`} />
              <Metric label="Avg win" value={moneySigned(stats.avgWin, cur)} tone="up" />
              <Metric label="Avg loss" value={moneySigned(stats.avgLoss, cur)} tone="down" />
              <Metric label="Best trade" value={moneySigned(stats.best, cur)} tone="up" />
              <Metric label="Worst trade" value={moneySigned(stats.worst, cur)} tone="down" />
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Weekly breakdown
          </h2>
          <div className="space-y-2">
            {weeks.map((week, i) => {
              const wt = week.filter((d) => d.getMonth() === cursor.m).flatMap((d) => byDay[ymd(d)] ?? []);
              if (wt.length === 0) return null;
              const net = wt.reduce((s, t) => s + (t.pnl ?? 0), 0);
              return (
                <div key={i} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-2">
                  <span className="text-sm text-muted">Week {i + 1}</span>
                  <div className="text-right">
                    <span className="mr-3 text-xs text-dim">{wt.length} trades</span>
                    <span
                      className={`text-sm font-medium ${net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-muted"}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {moneySigned(net, cur)}
                    </span>
                  </div>
                </div>
              );
            })}
            {trades.length === 0 && !loading && (
              <p className="text-sm text-dim">No trades logged this month yet.</p>
            )}
          </div>
        </div>
      </div>

      {selectedDay && (
        <DayModal
          day={selectedDay}
          trades={dayTrades}
          strategies={strategies}
          cur={cur}
          onClose={() => setSelectedDay(null)}
          onSaved={load}
          onDelete={deleteTrade}
        />
      )}

      {showImport && (
        <ImportTradesModal onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-surface2 p-3">
      <div className="text-xs text-dim">{label}</div>
      <div
        className={`mt-0.5 truncate text-lg font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

function DayModal({
  day,
  trades,
  strategies,
  cur,
  onClose,
  onSaved,
  onDelete,
}: {
  day: string;
  trades: Trade[];
  strategies: Strat[];
  cur: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const supabase = createClient();
  const watchlist = usePairs();
  const [adding, setAdding] = useState(trades.length === 0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pair, setPair] = useState("");
  const [direction, setDirection] = useState("long");
  const [pnl, setPnl] = useState("");
  const [r, setR] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [exit, setExit] = useState("");
  const [size, setSize] = useState("");
  const [emotion, setEmotion] = useState("");
  const [notes, setNotes] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setSaving(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setErr("Not signed in.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("trades").insert({
      user_id: u.user.id,
      traded_on: day,
      pair: pair || null,
      direction,
      entry_price: num(entry),
      stop_price: num(stop),
      exit_price: num(exit),
      size_lots: num(size),
      pnl: num(pnl),
      r_multiple: num(r),
      emotion: emotion || null,
      notes: notes || null,
      strategy_id: strategyId || null,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPair(""); setPnl(""); setR(""); setEntry(""); setStop("");
    setExit(""); setSize(""); setEmotion(""); setNotes(""); setStrategyId("");
    setAdding(false);
    onSaved();
  }

  const heading = new Date(day + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ring-1 ring-border2 sm:rounded-2xl sm:pb-6">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>{heading}</h2>
          <button onClick={onClose} className="-m-2 rounded-md p-2 text-muted hover:text-foreground" aria-label="Close">✕</button>
        </div>

        {trades.length > 0 && (
          <div className="mb-4 space-y-2">
            {trades.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{t.pair ?? "Trade"}</span>{" "}
                  <span className="text-dim">{t.direction}</span>
                  {t.notes && <div className="text-xs text-muted">{t.notes}</div>}
                </div>
                <div className="flex items-center gap-3">
                  {t.pnl != null && (
                    <span
                      className={`text-sm font-medium ${t.pnl > 0 ? "text-success" : t.pnl < 0 ? "text-danger" : "text-muted"}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {moneySigned(t.pnl, cur)}
                    </span>
                  )}
                  {confirmingId === t.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setConfirmingId(null); onDelete(t.id); }}
                        className="rounded-md bg-danger/15 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/25"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(t.id)}
                      className="rounded-md p-2 text-muted transition hover:bg-danger/15 hover:text-danger"
                      aria-label="Delete trade"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="space-y-3">
            {err && <p className="text-sm text-danger">{err}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pair">
                <input value={pair} onChange={(e) => setPair(e.target.value)} placeholder="EUR/USD" list="journal-pairs" className="jfield" />
                <datalist id="journal-pairs">
                  {watchlist.map((p) => (<option key={p} value={p} />))}
                </datalist>
                <span className="mt-0.5 block text-[11px]">
                  <Link href="/profile/pairs" className="text-accent2 hover:underline">Edit pairs</Link>
                </span>
              </Field>
              <Field label="Direction">
                <select value={direction} onChange={(e) => setDirection(e.target.value)} className="jfield">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </Field>
              <Field label="PnL ($)"><input value={pnl} onChange={(e) => setPnl(e.target.value)} className="jfield" /></Field>
              <Field label="R multiple"><input value={r} onChange={(e) => setR(e.target.value)} className="jfield" /></Field>
              <Field label="Entry"><input inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} className="jfield" /></Field>
              <Field label="Stop"><input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} className="jfield" /></Field>
              <Field label="Exit"><input inputMode="decimal" value={exit} onChange={(e) => setExit(e.target.value)} className="jfield" /></Field>
              <Field label="Size (lots)"><input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} className="jfield" /></Field>
              <Field label="Emotion"><input value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="Calm, FOMO..." className="jfield" /></Field>
              <Field label="Strategy">
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className="jfield">
                  <option value="">None</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="jfield resize-y" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              {trades.length > 0 && (
                <button onClick={() => setAdding(false)} className="rounded-lg border border-border2 px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
              )}
              <button onClick={save} disabled={saving} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save trade"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full rounded-lg border border-dashed border-border2 py-2.5 text-sm text-muted transition hover:border-accent hover:text-accent2">
            + Add another trade
          </button>
        )}
      </div>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      {children}
    </label>
  );
}
