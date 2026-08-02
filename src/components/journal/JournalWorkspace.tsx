"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { moneySigned, sym } from "@/lib/format";
import {
  emptySettings,
  fetchSettings,
  isJournaled,
  type ReviewLite,
  type UserSettings,
} from "@/lib/settings";
import ImportTradesModal from "./ImportTradesModal";
import TradeFormModal, { type TradeFormTrade } from "./TradeFormModal";
import JournalPanel, {
  fmtNet,
  type DayReview,
  type PanelScope,
  type Unit,
} from "./JournalPanel";

type Trade = TradeFormTrade;
type Strat = { id: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// traded_on may be a date ("2026-07-25") or a timestamp; day key is the date part.
const dayKey = (tradedOn: string) => tradedOn.slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};
// Monday of the week containing the given day.
const mondayOf = (day: string) => {
  const d = new Date(day + "T00:00:00");
  return addDays(day, -((d.getDay() + 6) % 7));
};
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
    rs,
  };
}

// R distribution buckets for the monthly histogram.
const R_BUCKETS: { label: string; test: (r: number) => boolean; lose: boolean }[] = [
  { label: "≤-2R", test: (r) => r <= -2, lose: true },
  { label: "-2..-1", test: (r) => r > -2 && r <= -1, lose: true },
  { label: "-1..0", test: (r) => r > -1 && r < 0, lose: true },
  { label: "0..1R", test: (r) => r >= 0 && r < 1, lose: false },
  { label: "1..2R", test: (r) => r >= 1 && r < 2, lose: false },
  { label: "≥2R", test: (r) => r >= 2, lose: false },
];

export default function JournalWorkspace() {
  const supabase = createClient();
  const router = useRouter();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [reviews, setReviews] = useState<Map<string, ReviewLite>>(new Map());
  const [reviewsAvailable, setReviewsAvailable] = useState(true);
  const [dayReviews, setDayReviews] = useState<Record<string, DayReview>>({});
  const [dayReviewsAvailable, setDayReviewsAvailable] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(emptySettings());
  const [strategies, setStrategies] = useState<Strat[]>([]);
  const [panel, setPanel] = useState<PanelScope | null>(null);
  const [formDay, setFormDay] = useState<string | null>(null);
  const [formTrade, setFormTrade] = useState<Trade | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cur, setCur] = useState("USD");
  const [accSize, setAccSize] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("money");

  // The 6x7 Monday-first grid; fetches cover the whole grid so weeks crossing
  // month boundaries are complete.
  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = (first.getDay() + 6) % 7;
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
  const gridStartStr = ymd(weeks[0][0]);
  const gridEndStr = addDays(ymd(weeks[5][6]), 1); // exclusive

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .gte("traded_on", gridStartStr)
      .lt("traded_on", gridEndStr)
      .order("traded_on", { ascending: true });
    setLoadError(error ? `Could not load trades: ${error.message}` : null);
    const list = (data as Trade[]) ?? [];
    setTrades(list);

    // Trade reviews for the journaled indicator + emotions (migration 0014).
    if (list.length) {
      const { data: revs, error: revErr } = await supabase
        .from("trade_reviews")
        .select(
          "trade_id, plan_followed, entry_emotion, exit_emotion, reflection, htf_path, mtf_path, ltf_path, confluences, management, mistakes"
        )
        .in("trade_id", list.map((t) => t.id));
      if (revErr) {
        setReviewsAvailable(false);
      } else {
        setReviewsAvailable(true);
        setReviews(new Map(((revs as ReviewLite[]) ?? []).map((r) => [r.trade_id, r])));
      }
    } else {
      setReviews(new Map());
    }

    // Day reviews: plan-followed, day note, routine ticks (migration 0015).
    const { data: days, error: dayErr } = await supabase
      .from("day_reviews")
      .select("day, plan_followed, note, routine_done")
      .gte("day", gridStartStr)
      .lt("day", gridEndStr);
    if (dayErr) {
      setDayReviewsAvailable(false);
    } else {
      setDayReviewsAvailable(true);
      const map: Record<string, DayReview> = {};
      (days as ({ day: string } & DayReview)[] | null)?.forEach((d) => {
        map[d.day] = {
          plan_followed: d.plan_followed,
          note: d.note,
          routine_done: d.routine_done ?? [],
        };
      });
      setDayReviews(map);
    }
    setLoading(false);
  }, [supabase, gridStartStr, gridEndStr]);

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
    fetchSettings(supabase).then(({ settings: s }) => setSettings(s));
    const savedUnit = localStorage.getItem("tb_journal_unit");
    if (savedUnit === "money" || savedUnit === "pct" || savedUnit === "r") setUnit(savedUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickUnit(u: Unit) {
    setUnit(u);
    localStorage.setItem("tb_journal_unit", u);
  }

  const byDay = useMemo(() => {
    const map: Record<string, Trade[]> = {};
    trades.forEach((t) => {
      (map[dayKey(t.traded_on)] ||= []).push(t);
    });
    return map;
  }, [trades]);

  // Monthly stats only count the visible month, not the grid overflow days.
  const monthTrades = useMemo(
    () => trades.filter((t) => {
      const d = dayKey(t.traded_on);
      return +d.slice(0, 4) === cursor.y && +d.slice(5, 7) === cursor.m + 1;
    }),
    [trades, cursor]
  );
  const stats = useMemo(() => computeStats(monthTrades), [monthTrades]);

  const rHist = useMemo(() => {
    const counts = R_BUCKETS.map((b) => stats.rs.filter((r) => b.test(r)).length);
    const max = Math.max(1, ...counts);
    return { counts, max };
  }, [stats.rs]);

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const todayStr = ymd(now);

  // --- panel helpers -------------------------------------------------------
  function jumpTo(day: string) {
    // Keep the calendar month in sync when panel arrows leave the grid.
    if (day < gridStartStr || day >= gridEndStr) {
      setCursor({ y: +day.slice(0, 4), m: +day.slice(5, 7) - 1 });
    }
  }

  function panelShift(delta: -1 | 1) {
    setPanel((p) => {
      if (!p) return p;
      if (p.kind === "day") {
        const next = addDays(p.day, delta);
        jumpTo(next);
        return { kind: "day", day: next };
      }
      const next = addDays(p.start, delta * 7);
      jumpTo(next);
      return { kind: "week", start: next };
    });
  }

  function panelToday() {
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setPanel((p) =>
      p?.kind === "week" ? { kind: "week", start: mondayOf(todayStr) } : { kind: "day", day: todayStr }
    );
  }

  function panelSwitchScope() {
    setPanel((p) => {
      if (!p) return p;
      if (p.kind === "day") return { kind: "week", start: mondayOf(p.day) };
      const day = todayStr >= p.start && todayStr <= addDays(p.start, 6) ? todayStr : p.start;
      return { kind: "day", day };
    });
  }

  const panelTrades = useMemo(() => {
    if (!panel) return [];
    if (panel.kind === "day") return byDay[panel.day] ?? [];
    const end = addDays(panel.start, 7);
    return trades.filter((t) => {
      const d = dayKey(t.traded_on);
      return d >= panel.start && d < end;
    });
  }, [panel, byDay, trades]);

  async function saveDayReview(day: string, patch: Partial<DayReview>) {
    const prev = dayReviews[day] ?? { plan_followed: null, note: null, routine_done: [] };
    const next = { ...prev, ...patch };
    setDayReviews((m) => ({ ...m, [day]: next }));
    if (!dayReviewsAvailable) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("day_reviews")
      .upsert({ user_id: u.user.id, day, ...patch }, { onConflict: "user_id,day" });
    if (error) setLoadError(`Could not save day review: ${error.message}`);
  }

  // -------------------------------------------------------------------------

  return (
    <div
      className={`mx-auto max-w-6xl px-4 py-6 transition-[margin] duration-200 md:px-8 md:py-8 ${
        panel ? "md:mr-[390px] md:max-w-none" : ""
      }`}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl">Journal</h1>
          <p className="mt-1 text-muted">
            Review your trades, emotions, and patterns to build consistency.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-border2 bg-card p-0.5"
            role="group"
            aria-label="PnL display unit"
          >
            {([["money", sym(cur).trim() || "$"], ["pct", "%"], ["r", "R"]] as [Unit, string][]).map(
              ([u, label]) => (
                <button
                  key={u}
                  onClick={() => pickUnit(u)}
                  title={u === "pct" && !accSize ? "Set your account size in Settings first" : undefined}
                  className={`rounded-md px-2.5 py-1.5 font-mono text-xs font-medium transition ${
                    unit === u ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-border2 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
          >
            Import trades
          </button>
          <button
            onClick={() => { setFormTrade(null); setFormDay(panel?.kind === "day" ? panel.day : todayStr); }}
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
            const journaledCount = reviewsAvailable
              ? dayTradesCell.filter((t) => isJournaled(reviews.get(t.id))).length
              : 0;
            const selected = panel?.kind === "day" && panel.day === key;
            return (
              <button
                key={key}
                onClick={() => setPanel({ kind: "day", day: key })}
                className={`flex h-12 flex-col overflow-hidden rounded-md border p-1 text-left transition hover:border-accent md:h-24 md:rounded-lg md:p-2 ${
                  has
                    ? win
                      ? "border-success/40 bg-success/10"
                      : net < 0
                        ? "border-danger/40 bg-danger/10"
                        : "border-border"
                    : "border-border"
                } ${inMonth ? "" : "opacity-40"} ${key === todayStr ? "ring-1 ring-accent" : ""} ${
                  selected ? "ring-2 ring-accent2" : ""
                }`}
              >
                <span className="text-xs text-dim">{d.getDate()}</span>
                {has && (
                  <span className="mt-auto block min-w-0">
                    {reviewsAvailable && (
                      <span className="mb-0.5 hidden items-center gap-[3px] md:flex" aria-hidden="true">
                        {dayTradesCell.length <= 6 ? (
                          dayTradesCell.map((t) => (
                            <span
                              key={t.id}
                              className={`h-[5px] w-[5px] rounded-full ${
                                isJournaled(reviews.get(t.id))
                                  ? "bg-accent2"
                                  : "border border-dim"
                              }`}
                            />
                          ))
                        ) : (
                          <span className="font-mono text-[9px] text-accent2">
                            {journaledCount}/{dayTradesCell.length} journaled
                          </span>
                        )}
                      </span>
                    )}
                    <span className="hidden text-[11px] text-muted md:block">
                      {dayTradesCell.length} {dayTradesCell.length === 1 ? "trade" : "trades"}
                    </span>
                    <span
                      className={`block truncate text-[10px] font-medium md:text-xs ${win ? "text-success" : net < 0 ? "text-danger" : "text-muted"}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      <span className="md:hidden">
                        {unit === "money"
                          ? `${net > 0 ? "+" : net < 0 ? "-" : ""}${sym(cur)}${compactMoney(net)}`
                          : fmtNet(dayTradesCell, unit, cur, accSize)}
                      </span>
                      <span className="hidden md:inline">{fmtNet(dayTradesCell, unit, cur, accSize)}</span>
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
            <>
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
              {stats.rs.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-xs text-dim">R distribution ({stats.rs.length} trades with R)</div>
                  <div className="flex h-24 items-end gap-2">
                    {R_BUCKETS.map((b, i) => (
                      <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <span className="font-mono text-[10px] text-dim">
                          {rHist.counts[i] || ""}
                        </span>
                        <div
                          className={`w-full max-w-9 rounded-t ${b.lose ? "bg-danger/60" : "bg-accent"}`}
                          style={{ height: `${(rHist.counts[i] / rHist.max) * 72}px` }}
                        />
                        <span className="font-mono text-[9px] text-dim">{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            Weekly breakdown
          </h2>
          <p className="mb-3 text-xs text-dim">Click a week to open it in the panel.</p>
          <div className="space-y-2">
            {weeks.map((week, i) => {
              const start = ymd(week[0]);
              const end = addDays(start, 7);
              const wt = trades.filter((t) => {
                const d = dayKey(t.traded_on);
                return d >= start && d < end;
              });
              if (wt.length === 0) return null;
              const daysTraded = new Set(wt.map((t) => dayKey(t.traded_on))).size;
              const isCurrent = todayStr >= start && todayStr < end;
              const selected = panel?.kind === "week" && panel.start === start;
              const netStr = fmtNet(wt, unit, cur, accSize);
              const netVal = wt.reduce((s, t) => s + (t.pnl ?? 0), 0);
              return (
                <button
                  key={i}
                  onClick={() => setPanel({ kind: "week", start })}
                  className={`flex w-full items-center justify-between rounded-lg bg-surface2 px-3 py-2.5 text-left transition hover:ring-1 hover:ring-accent ${
                    selected ? "ring-1 ring-accent2" : isCurrent ? "ring-1 ring-accent/50" : ""
                  }`}
                >
                  <span className="text-sm text-muted">
                    Week {i + 1}
                    {isCurrent && <span className="ml-1.5 text-xs text-accent2">· current</span>}
                  </span>
                  <span className="text-right">
                    <span className="mr-3 text-xs text-dim">
                      {daysTraded} {daysTraded === 1 ? "day" : "days"} · {wt.length} trades
                    </span>
                    <span
                      className={`text-sm font-medium ${netVal > 0 ? "text-success" : netVal < 0 ? "text-danger" : "text-muted"}`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {netStr}
                    </span>
                  </span>
                </button>
              );
            })}
            {trades.length === 0 && !loading && (
              <p className="text-sm text-dim">No trades logged this month yet.</p>
            )}
          </div>
        </div>
      </div>

      {panel && (
        <JournalPanel
          scope={panel}
          trades={panelTrades}
          reviews={reviews}
          dayReviews={dayReviews}
          settings={settings}
          dayReviewsAvailable={dayReviewsAvailable}
          reviewsAvailable={reviewsAvailable}
          cur={cur}
          accSize={accSize}
          unit={unit}
          todayStr={todayStr}
          onClose={() => setPanel(null)}
          onShift={panelShift}
          onToday={panelToday}
          onSwitchScope={panelSwitchScope}
          onAddTrade={(day) => { setFormTrade(null); setFormDay(day); }}
          onOpenTrade={(id) => router.push(`/journal/trade/${id}`)}
          onEditTrade={(t) => {
            const full = trades.find((x) => x.id === t.id) ?? null;
            setFormTrade(full);
            setFormDay(full ? dayKey(full.traded_on) : null);
          }}
          onSaveDay={saveDayReview}
        />
      )}

      {formDay && (
        <TradeFormModal
          day={formDay}
          trade={formTrade}
          strategies={strategies}
          onClose={() => { setFormDay(null); setFormTrade(null); }}
          onSaved={load}
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
