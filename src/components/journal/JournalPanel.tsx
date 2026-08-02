"use client";

// The journal drawer: opens from the right when a calendar day or a weekly
// breakdown row is clicked. One component, two scopes (day | week) - same
// stats, guardrails, routine, note and trade list either way. Desktop: a
// docked panel pinned to the right edge. Mobile: a full-screen sheet.
import { useEffect, useMemo, useRef, useState } from "react";
import { moneySigned } from "@/lib/format";
import {
  computeViolations,
  isJournaled,
  emojiFor,
  type ReviewLite,
  type UserSettings,
} from "@/lib/settings";
import PairFlag from "@/components/PairFlag";
import MicButton from "@/components/MicButton";

export type PanelTrade = {
  id: string;
  traded_on: string;
  pair: string | null;
  direction: string | null;
  pnl: number | null;
  r_multiple: number | null;
  emotion: string | null;
};

export type DayReview = {
  plan_followed: "yes" | "partial" | "no" | null;
  note: string | null;
  routine_done: string[];
};

export type PanelScope = { kind: "day"; day: string } | { kind: "week"; start: string };

export type Unit = "money" | "pct" | "r";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayKey = (t: string) => t.slice(0, 10);

export function fmtNet(
  trades: { pnl: number | null; r_multiple: number | null }[],
  unit: Unit,
  cur: string,
  accSize: number | null
): string {
  const net = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  if (unit === "pct") {
    if (!accSize) return "—";
    const p = (net / accSize) * 100;
    return `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
  }
  if (unit === "r") {
    const rs = trades.filter((t) => t.r_multiple != null);
    if (!rs.length) return "—";
    const r = rs.reduce((s, t) => s + (t.r_multiple as number), 0);
    return `${r > 0 ? "+" : ""}${r.toFixed(2)}R`;
  }
  return moneySigned(net, cur);
}

function timeOf(tradedOn: string): string | null {
  if (tradedOn.length <= 10) return null;
  const t = tradedOn.slice(11, 16);
  return t === "00:00" ? null : t;
}

export default function JournalPanel({
  scope,
  trades,
  reviews,
  dayReviews,
  settings,
  dayReviewsAvailable,
  reviewsAvailable,
  cur,
  accSize,
  unit,
  todayStr,
  onClose,
  onShift,
  onToday,
  onSwitchScope,
  onAddTrade,
  onOpenTrade,
  onEditTrade,
  onSaveDay,
}: {
  scope: PanelScope;
  trades: PanelTrade[];
  reviews: Map<string, ReviewLite>;
  dayReviews: Record<string, DayReview>;
  settings: UserSettings;
  dayReviewsAvailable: boolean;
  reviewsAvailable: boolean;
  cur: string;
  accSize: number | null;
  unit: Unit;
  todayStr: string;
  onClose: () => void;
  onShift: (delta: -1 | 1) => void;
  onToday: () => void;
  onSwitchScope: () => void;
  onAddTrade: (day: string) => void;
  onOpenTrade: (id: string) => void;
  onEditTrade: (t: PanelTrade) => void;
  onSaveDay: (day: string, patch: Partial<DayReview>) => void;
}) {
  const isDay = scope.kind === "day";
  const anchorDay = isDay ? scope.day : scope.start;

  // Escape closes (unless a nested modal handles it first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // --- title -----------------------------------------------------------
  const title = useMemo(() => {
    if (isDay) {
      const d = new Date(anchorDay + "T00:00:00");
      const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" });
      const rel =
        anchorDay === todayStr
          ? "today"
          : anchorDay === ymd(new Date(new Date(todayStr + "T00:00:00").getTime() - 86400000))
            ? "yesterday"
            : null;
      return { label, rel };
    }
    const start = new Date(anchorDay + "T00:00:00");
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    const fmt = (d: Date, m: boolean) =>
      d.toLocaleDateString(undefined, m ? { day: "numeric" } : { day: "numeric", month: "short" });
    const label = `Week of ${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${fmt(end, sameMonth && false)}`;
    const isCurrent = todayStr >= anchorDay && todayStr <= ymd(end);
    return { label, rel: isCurrent ? "current" : null };
  }, [isDay, anchorDay, todayStr]);

  // --- stats -----------------------------------------------------------
  const withPnl = trades.filter((t) => t.pnl != null) as (PanelTrade & { pnl: number })[];
  const wins = withPnl.filter((t) => t.pnl > 0).length;
  const losses = withPnl.filter((t) => t.pnl < 0).length;
  const decided = wins + losses;
  const net = withPnl.reduce((s, t) => s + t.pnl, 0);
  const rs = trades.filter((t) => t.r_multiple != null).map((t) => t.r_multiple as number);
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const journaled = reviewsAvailable
    ? trades.filter((t) => isJournaled(reviews.get(t.id))).length
    : null;

  // --- guardrail violations (computed live, per day) ---------------------
  const byDay = useMemo(() => {
    const m: Record<string, PanelTrade[]> = {};
    trades.forEach((t) => {
      (m[dayKey(t.traded_on)] ||= []).push(t);
    });
    return m;
  }, [trades]);

  const violations = useMemo(() => {
    const out: { day: string; label: string }[] = [];
    for (const [day, dts] of Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))) {
      computeViolations(dts, settings, accSize ?? 0).forEach((v) =>
        out.push({ day, label: v.label })
      );
    }
    return out;
  }, [byDay, settings, accSize]);

  const [showViolations, setShowViolations] = useState(false);
  const [showRoutine, setShowRoutine] = useState(false);

  // --- day review bits ---------------------------------------------------
  const review = dayReviews[anchorDay];
  const routineDone = review?.routine_done ?? [];
  const routineTotal = settings.routine_items.length;

  function toggleRoutine(item: string) {
    const next = routineDone.includes(item)
      ? routineDone.filter((x) => x !== item)
      : [...routineDone, item];
    onSaveDay(anchorDay, { routine_done: next });
  }

  // Week scope: how many days completed the whole routine.
  const weekDays = useMemo(() => {
    if (isDay) return [];
    const start = new Date(anchorDay + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => ymd(new Date(start.getTime() + i * 86400000)));
  }, [isDay, anchorDay]);
  const routineDaysDone = weekDays.filter(
    (d) => routineTotal > 0 && (dayReviews[d]?.routine_done ?? []).length >= routineTotal
  ).length;

  // --- note (debounced autosave) -----------------------------------------
  const [note, setNote] = useState(review?.note ?? "");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setNote(dayReviews[anchorDay]?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorDay]);
  function onNote(v: string) {
    setNote(v);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => onSaveDay(anchorDay, { note: v }), 800);
  }
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    []
  );

  // --- weekly AI recap (week scope): streams from /api/ai, which already
  // has the full data snapshot server-side --------------------------------
  const [recap, setRecap] = useState("");
  const [recapBusy, setRecapBusy] = useState(false);
  useEffect(() => {
    setRecap("");
    setRecapBusy(false);
  }, [anchorDay, isDay]);

  async function generateRecap() {
    if (isDay || recapBusy) return;
    setRecapBusy(true);
    setRecap("");
    const end = ymd(new Date(new Date(anchorDay + "T00:00:00").getTime() + 6 * 86400000));
    const prompt =
      `Weekly recap request - this is a data-only task, NOT a chart or setup check. ` +
      `There is no screenshot and none is needed; never ask for one. ` +
      `From the data snapshot alone, recap my trading week ${anchorDay} to ${end} ` +
      `(trades whose date falls in that range). Cover: the net result, what worked ` +
      `(plans, confluences), repeated mistakes and emotions, guardrail violations and ` +
      `plan adherence - and end with exactly one specific focus for next week. ` +
      `If I logged no trades in that range, say so in one line and stop. ` +
      `Plain text, no headers, under 180 words, direct.`;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", text: prompt }], page: "/journal" }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setRecap((j as { error?: string } | null)?.error ?? "Recap unavailable right now.");
        setRecapBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setRecap((r) => r + dec.decode(value, { stream: true }));
      }
    } catch {
      setRecap("Recap unavailable right now.");
    }
    setRecapBusy(false);
  }

  // --- trade list filter --------------------------------------------------
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");
  const [q, setQ] = useState("");
  const visible = trades.filter((t) => {
    if (filter === "wins" && !(t.pnl != null && t.pnl > 0)) return false;
    if (filter === "losses" && !(t.pnl != null && t.pnl < 0)) return false;
    if (q && !(t.pair ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const netStr = fmtNet(trades, unit, cur, accSize);

  const planBtn = (v: "yes" | "partial" | "no", label: string) => {
    const on = review?.plan_followed === v;
    const tone =
      v === "yes" ? "bg-success text-[#06120d]" : v === "partial" ? "bg-gold text-[#161A23]" : "bg-danger text-white";
    return (
      <button
        key={v}
        onClick={() => onSaveDay(anchorDay, { plan_followed: on ? null : v })}
        className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition ${
          on ? tone : "text-muted hover:text-foreground"
        }`}
      >
        {label}
      </button>
    );
  };

  const planDot = (d: string) => {
    const v = dayReviews[d]?.plan_followed;
    const cls =
      v === "yes" ? "bg-success" : v === "partial" ? "bg-gold" : v === "no" ? "bg-danger" : "border border-border2";
    return <span key={d} className={`inline-block h-2 w-2 rounded-full ${cls}`} title={`${d}: ${v ?? "not set"}`} />;
  };

  return (
    <>
      {/* Mobile backdrop only: on desktop the calendar stays interactive. */}
      <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label={isDay ? "Day journal" : "Week journal"}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border2 bg-card shadow-2xl md:w-[380px]"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            onClick={() => onShift(-1)}
            aria-label={isDay ? "Previous day" : "Previous week"}
            className="rounded-md border border-border2 p-1.5 text-muted transition hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => onShift(1)}
            aria-label={isDay ? "Next day" : "Next week"}
            className="rounded-md border border-border2 p-1.5 text-muted transition hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
              {title.label}
              {title.rel && <span className="ml-1.5 text-xs font-normal text-accent2">· {title.rel}</span>}
            </div>
          </div>
          <button
            onClick={onToday}
            className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:text-foreground"
          >
            Today
          </button>
          <button onClick={onClose} aria-label="Close panel" className="rounded-md p-1.5 text-muted transition hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* net pnl + scope switch */}
          <div className="flex items-start justify-between">
            <div>
              <div
                className={`text-[26px] font-semibold leading-tight ${net > 0 ? "text-success" : net < 0 ? "text-danger" : ""}`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {netStr}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-dim">Net PnL</div>
            </div>
            <button
              onClick={onSwitchScope}
              className="rounded-md border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              {isDay ? "Week view" : "Day view"}
            </button>
          </div>

          {/* stat grid */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Win rate" value={decided ? `${((wins / decided) * 100).toFixed(0)}%` : "—"} />
            <Stat label="Avg R" value={avgR == null ? "—" : `${avgR.toFixed(2)}R`} tone={avgR == null ? undefined : avgR >= 0 ? "up" : "down"} />
            <Stat label="Trades" value={String(trades.length)} />
            <Stat label="Wins" value={String(wins)} tone="up" />
            <Stat label="Losses" value={String(losses)} tone="down" />
            <Stat
              label="Journaled"
              value={journaled == null ? "—" : `${journaled}/${trades.length}`}
              tone={journaled != null && trades.length > 0 && journaled === trades.length ? "up" : undefined}
            />
          </div>

          {/* weekly AI recap */}
          {!isDay && (
            <div className="mt-3 border-t border-border pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Week recap</span>
                <button
                  onClick={generateRecap}
                  disabled={recapBusy}
                  className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
                >
                  {recapBusy ? "Thinking…" : recap ? "Regenerate" : "Ask Sidekick"}
                </button>
              </div>
              {recap && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface2 px-3 py-2.5 text-xs leading-relaxed text-muted">
                  {recap}
                </p>
              )}
            </div>
          )}

          {/* plan followed */}
          <div className="mt-3 flex items-center justify-between border-t border-border py-2.5">
            <span className="text-sm text-muted">Plan followed</span>
            {isDay ? (
              dayReviewsAvailable ? (
                <div className="flex rounded-lg border border-border bg-surface2 p-0.5">
                  {planBtn("yes", "Yes")}
                  {planBtn("partial", "Partial")}
                  {planBtn("no", "No")}
                </div>
              ) : (
                <span className="text-xs text-dim">needs migration 0015</span>
              )
            ) : (
              <div className="flex items-center gap-1.5">{weekDays.map((d) => planDot(d))}</div>
            )}
          </div>

          {/* guardrail violations */}
          <button
            onClick={() => setShowViolations((s) => !s)}
            className="flex w-full items-center justify-between border-t border-border py-2.5 text-left"
            aria-expanded={showViolations}
          >
            <span className="text-sm text-muted">Guardrail violations</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                violations.length
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border2 text-dim"
              }`}
            >
              {violations.length}
            </span>
          </button>
          {showViolations && (
            <div className="mb-1 rounded-lg bg-surface2 px-3 py-2">
              {violations.length === 0 && <p className="py-1 text-xs text-dim">None. Guardrails come from Settings → Trading.</p>}
              {violations.map((v, i) => (
                <p key={i} className="flex items-start gap-2 py-1 text-xs text-danger">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                  <span>{!isDay && <span className="mr-1 font-mono text-dim">{v.day.slice(5)}</span>}{v.label}</span>
                </p>
              ))}
            </div>
          )}

          {/* pre-market routine */}
          <button
            onClick={() => setShowRoutine((s) => !s)}
            className="flex w-full items-center justify-between border-t border-border py-2.5 text-left"
            aria-expanded={showRoutine}
          >
            <span className="text-sm text-muted">Pre-market routine</span>
            <span className="rounded-full border border-border2 px-2.5 py-0.5 font-mono text-[11px] text-muted">
              {isDay
                ? routineTotal
                  ? `${routineDone.filter((x) => settings.routine_items.includes(x)).length}/${routineTotal}`
                  : "none set"
                : `${routineDaysDone}/${weekDays.length} days`}
            </span>
          </button>
          {showRoutine && isDay && (
            <div className="mb-1 rounded-lg bg-surface2 px-3 py-2">
              {settings.routine_items.length === 0 && (
                <p className="py-1 text-xs text-dim">No routine yet. Build it in Settings → Pre-market routine.</p>
              )}
              {settings.routine_items.map((item) => {
                const done = routineDone.includes(item);
                return (
                  <button
                    key={item}
                    onClick={() => dayReviewsAvailable && toggleRoutine(item)}
                    className="flex w-full items-center gap-2.5 py-1.5 text-left text-sm"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        done ? "border-success bg-success" : "border-border2"
                      }`}
                    >
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#06120d" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      )}
                    </span>
                    <span className={done ? "text-muted line-through" : ""}>{item}</span>
                  </button>
                );
              })}
            </div>
          )}
          {showRoutine && !isDay && (
            <div className="mb-1 rounded-lg bg-surface2 px-3 py-2">
              {weekDays.map((d) => (
                <p key={d} className="flex justify-between py-1 font-mono text-xs text-muted">
                  <span>{d.slice(5)}</span>
                  <span>{(dayReviews[d]?.routine_done ?? []).length}/{routineTotal}</span>
                </p>
              ))}
            </div>
          )}

          {/* day note */}
          {isDay && (
            <div className="mt-2 border-t border-border pt-3">
              <div className="relative">
                <textarea
                  value={note}
                  onChange={(e) => onNote(e.target.value)}
                  placeholder={dayReviewsAvailable ? "Add a day note…" : "Day notes need migration 0015"}
                  disabled={!dayReviewsAvailable}
                  rows={2}
                  className="jfield w-full resize-y pr-11"
                  aria-label="Day note"
                />
                <div className="absolute bottom-2 right-2">
                  <MicButton onText={(t) => onNote(note ? `${note} ${t}` : t)} title="Dictate day note" />
                </div>
              </div>
            </div>
          )}

          {/* trades */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Trades <span className="text-xs font-normal text-dim">· tap to journal</span>
            </span>
            <button
              onClick={() => onAddTrade(isDay ? anchorDay : todayStr)}
              className="rounded-md border border-border2 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              + Add
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {(["all", "wins", "losses"] as const).map((fk) => (
              <button
                key={fk}
                onClick={() => setFilter(fk)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                  filter === fk
                    ? "border-transparent bg-accent text-white"
                    : "border-border2 text-muted hover:text-foreground"
                }`}
              >
                {fk}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Instrument"
              aria-label="Search instruments"
              className="ml-auto w-28 rounded-md border border-border bg-surface2 px-2.5 py-1 text-xs outline-none transition focus:border-accent"
            />
          </div>

          <div className="mt-2 space-y-0.5 pb-4">
            {visible.length === 0 && (
              <p className="py-3 text-center text-xs text-dim">
                {trades.length === 0 ? "No trades logged." : "Nothing matches the filter."}
              </p>
            )}
            {visible.map((t, i) => {
              const r = reviews.get(t.id);
              const jd = isJournaled(r);
              const day = dayKey(t.traded_on);
              const prevDay = i > 0 ? dayKey(visible[i - 1].traded_on) : null;
              const em = [emojiFor(r?.entry_emotion ?? null), emojiFor(r?.exit_emotion ?? null)].filter(Boolean);
              return (
                <div key={t.id}>
                  {!isDay && day !== prevDay && (
                    <div className="mt-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                      {new Date(day + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                  )}
                  <div className="group flex items-center gap-2 rounded-lg px-1.5 py-2 transition hover:bg-surface2">
                    <button
                      onClick={() => onOpenTrade(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title={jd ? "Journaled - open" : "Not journaled yet - open"}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${jd ? "bg-accent2" : "border border-dim"}`}
                        aria-label={jd ? "Journaled" : "Not journaled"}
                      />
                      <PairFlag pair={t.pair} size={18} />
                      <span className="truncate text-sm font-medium">{t.pair ?? "Trade"}</span>
                      {timeOf(t.traded_on) && (
                        <span className="font-mono text-[11px] text-dim">{timeOf(t.traded_on)}</span>
                      )}
                      <span className={`text-[11px] font-medium ${t.direction === "long" ? "text-success" : "text-danger"}`}>
                        {t.direction === "long" ? "Long" : t.direction === "short" ? "Short" : ""}
                      </span>
                      {em.length > 0 && <span className="text-xs" aria-hidden="true">{em.join("→")}</span>}
                    </button>
                    {t.pnl != null && (
                      <span
                        className={`shrink-0 font-mono text-xs font-medium ${t.pnl > 0 ? "text-success" : t.pnl < 0 ? "text-danger" : "text-muted"}`}
                      >
                        {fmtNet([t], unit, cur, accSize)}
                      </span>
                    )}
                    <button
                      onClick={() => onEditTrade(t)}
                      aria-label="Edit trade"
                      className="shrink-0 rounded-md p-1.5 text-dim opacity-0 transition hover:bg-accent/15 hover:text-accent2 focus:opacity-100 group-hover:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-surface2 px-2.5 py-2">
      <div
        className={`font-mono text-[15px] font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
    </div>
  );
}
