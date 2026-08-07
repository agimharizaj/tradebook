"use client";

// The trading-day panel on the Trading page: pre-market routine checklist,
// live guardrail readouts (trades today, trading window, net PnL vs limits)
// and warnings, plus today's logged trades. Docked to the RIGHT of the chart
// (outside #tv-chart-area so screen captures stay clean); on phones it opens
// as a bottom sheet from the toolbar. Routine ticks persist per-day in
// day_reviews and reset naturally each trading day.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { moneySigned } from "@/lib/format";
import {
  activeWindows,
  computeViolations,
  emptySettings,
  fetchSettings,
  inWindow,
  resolveAmount,
  type UserSettings,
} from "@/lib/settings";
import PairFlag from "@/components/PairFlag";
import { usePairs } from "@/lib/usePairs";
import { tvSymbolFor } from "@/lib/pairs";
import AccountSwitcher from "@/components/AccountSwitcher";
import {
  ALL_ACCOUNTS,
  effectiveGuardrails,
  fetchAccounts,
  useSelectedAccount,
  type Account,
} from "@/lib/accounts";

type Trade = {
  id: string;
  traded_on: string;
  pair: string | null;
  direction: string | null;
  pnl: number | null;
};

type NewsItem = { title: string; link: string; pubDate: string; source: string; body: string };

const pad = (n: number) => String(n).padStart(2, "0");
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function TradingDayPanel({
  mobileOpen,
  onMobileClose,
  currentTv,
  onPickSymbol,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  currentTv?: string;
  onPickSymbol?: (tv: string) => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [defaults, setDefaults] = useState<UserSettings>(emptySettings());
  const [settingsAvailable, setSettingsAvailable] = useState(true);
  // Prop-firm accounts: guardrails, size and currency follow the selection.
  const [account, setAccount] = useState<Account | null>(null);
  const [selAccount] = useSelectedAccount();
  const settings = useMemo(() => effectiveGuardrails(account, defaults), [account, defaults]);
  const [dayAvailable, setDayAvailable] = useState(true);
  const [routineDone, setRoutineDone] = useState<string[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [cur, setCur] = useState("USD");
  const [accSize, setAccSize] = useState(0);
  const [lifetimeNet, setLifetimeNet] = useState<number | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [, setTick] = useState(0); // re-render each minute for the window pill
  const notifiedRef = useRef(false);
  const day = todayYmd();
  const watchlist = usePairs();

  useEffect(() => {
    setCollapsed(localStorage.getItem("tb_tradingday_collapsed") === "1");
  }, []);

  const load = useCallback(async () => {
    const [{ settings: s, available }, dayRes, userRes, accRes] = await Promise.all([
      fetchSettings(supabase),
      supabase.from("day_reviews").select("routine_done").eq("day", day).maybeSingle(),
      supabase.auth.getUser(),
      fetchAccounts(supabase),
    ]);
    setDefaults(s);
    setSettingsAvailable(available);
    const acct =
      accRes.available && selAccount !== ALL_ACCOUNTS
        ? accRes.accounts.find((a) => a.id === selAccount) ?? null
        : null;
    setAccount(acct);
    if (dayRes.error) setDayAvailable(false);
    else setRoutineDone(((dayRes.data as { routine_done: string[] } | null)?.routine_done ?? []));
    const m = userRes.data.user?.user_metadata ?? {};
    const metaCur = typeof m.account_currency === "string" && m.account_currency ? m.account_currency : "USD";
    setCur(acct?.currency ?? metaCur);
    const metaSize = parseFloat(m.account_size);
    // All-accounts balance base mirrors the dashboard: sum of VISIBLE account
    // sizes when a ledger exists, profile default otherwise.
    const visibleSizes = accRes.accounts
      .filter((a) => !a.hidden)
      .reduce((sm, a) => sm + (a.size ?? 0), 0);
    setAccSize(
      acct?.size ??
        (visibleSizes > 0 ? visibleSizes : !Number.isNaN(metaSize) && metaSize > 0 ? metaSize : 0)
    );

    // Today's trades + lifetime net (for the derived balance), scoped to the
    // selected account when there is one. Unscoped, hidden accounts' trades
    // are excluded from the combined numbers (unassigned trades count).
    const hiddenIds = new Set(accRes.accounts.filter((a) => a.hidden).map((a) => a.id));
    const withAcc = accRes.available; // trades.account_id ships with 0019
    let todayQ = supabase
      .from("trades")
      .select(withAcc ? "id, traded_on, pair, direction, pnl, account_id" : "id, traded_on, pair, direction, pnl")
      .gte("traded_on", day)
      .lt("traded_on", `${day}T23:59:59.999Z`)
      .order("traded_on", { ascending: true });
    let lifeQ = supabase.from("trades").select(withAcc ? "pnl, account_id" : "pnl");
    if (acct) {
      todayQ = todayQ.eq("account_id", acct.id);
      lifeQ = lifeQ.eq("account_id", acct.id);
    }
    const [tradesRes, lifeRes] = await Promise.all([todayQ, lifeQ]);
    type WithAcc = { account_id?: string | null };
    const skipHidden = (t: WithAcc) => acct || !t.account_id || !hiddenIds.has(t.account_id);
    setTrades((((tradesRes.data as unknown as (Trade & WithAcc)[]) ?? []).filter(skipHidden)));
    if (lifeRes.data) {
      setLifetimeNet(
        ((lifeRes.data as unknown as ({ pnl: number | null } & WithAcc)[]))
          .filter(skipHidden)
          .reduce((sm, t) => sm + (t.pnl ?? 0), 0)
      );
    }
  }, [supabase, day, selAccount]);

  useEffect(() => {
    load();
  }, [load]);

  // Today's headlines, once.
  useEffect(() => {
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: NewsItem[] } | null) => {
        if (!j?.items) return;
        const today = new Date().toDateString();
        setNews(
          j.items
            .filter((x) => new Date(x.pubDate).toDateString() === today)
            .slice(0, 5)
        );
      })
      .catch(() => setNews(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Minute tick: window open/closed pill + routine reminder.
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Routine reminder: fires once per day, only while the app is open, only
  // when notifications are enabled + granted and the routine is incomplete.
  useEffect(() => {
    if (!settings.routine_notify || !settings.routine_remind_at) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const check = () => {
      if (notifiedRef.current) return;
      if (localStorage.getItem("tb_routine_notified") === day) {
        notifiedRef.current = true;
        return;
      }
      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const total = settings.routine_items.length;
      const done = routineDone.filter((x) => settings.routine_items.includes(x)).length;
      if (hhmm >= settings.routine_remind_at! && total > 0 && done < total) {
        new Notification("Pre-market routine", {
          body: `${done}/${total} done. Finish your routine before the session.`,
        });
        localStorage.setItem("tb_routine_notified", day);
        notifiedRef.current = true;
      }
    };
    check();
    const iv = setInterval(check, 60_000);
    return () => clearInterval(iv);
  }, [settings, routineDone, day]);

  async function toggleRoutine(item: string) {
    const next = routineDone.includes(item)
      ? routineDone.filter((x) => x !== item)
      : [...routineDone, item];
    setRoutineDone(next);
    if (!dayAvailable) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase
      .from("day_reviews")
      .upsert({ user_id: u.user.id, day, routine_done: next }, { onConflict: "user_id,day" });
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("tb_tradingday_collapsed", c ? "0" : "1");
      return !c;
    });
  }

  // --- derived ------------------------------------------------------------
  const net = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const lossCap = resolveAmount(settings.max_daily_loss, accSize);
  const target = resolveAmount(settings.max_daily_profit, accSize);
  const windows = activeWindows(settings);
  const windowOpen = windows.length ? windows.some((w) => inWindow(w, new Date())) : null;
  const violations = useMemo(
    () => computeViolations(trades, settings, accSize),
    [trades, settings, accSize]
  );
  const routineTotal = settings.routine_items.length;
  const routineCount = routineDone.filter((x) => settings.routine_items.includes(x)).length;

  // PnL bar, EdgeFlo-style: zero is always the visual centre and each half
  // scales to its own cap (left = loss cap, right = target), so the fill
  // grows from the middle and a flat day shows an empty bar.
  const bar = useMemo(() => {
    const lossSpan = Math.abs(lossCap ?? target ?? Math.max(Math.abs(net), 1));
    const gainSpan = Math.abs(target ?? lossCap ?? Math.max(Math.abs(net), 1));
    const now =
      net >= 0
        ? 50 + Math.min(50, (net / (gainSpan || 1)) * 50)
        : 50 - Math.min(50, (Math.abs(net) / (lossSpan || 1)) * 50);
    return { left: Math.min(50, now), width: Math.abs(now - 50), zero: 50 };
  }, [net, lossCap, target]);

  const body = (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* account context */}
      <div className="border-b border-border px-4 py-2.5">
        <AccountSwitcher className="w-full !py-1.5 !text-xs" />
        {account && (
          <p className="mt-1 text-[10px] text-dim">
            Guardrails, balance and trades scoped to {account.name}.
          </p>
        )}
      </div>

      {/* routine */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Pre-market routine
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
              routineTotal > 0 && routineCount >= routineTotal
                ? "border-success/40 bg-success/10 text-success"
                : "border-border2 text-muted"
            }`}
          >
            {routineTotal ? `${routineCount}/${routineTotal}` : "none"}
          </span>
        </div>
        <div className="mt-2">
          {settings.routine_items.length === 0 && (
            <p className="text-xs text-dim">
              Build your routine in{" "}
              <Link href="/settings?tab=routine" className="text-accent2 hover:underline">
                Settings
              </Link>
              .
            </p>
          )}
          {settings.routine_items.map((item) => {
            const done = routineDone.includes(item);
            return (
              <button
                key={item}
                onClick={() => toggleRoutine(item)}
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
      </div>

      {/* guardrails */}
      <div className="border-b border-border px-4 py-3">
        {accSize > 0 && lifetimeNet != null && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-muted">Balance</span>
            <span
              className={`font-mono text-sm font-semibold ${lifetimeNet > 0 ? "text-success" : lifetimeNet < 0 ? "text-danger" : ""}`}
              title="Account size + lifetime net PnL"
            >
              {moneySigned(accSize + lifetimeNet, cur).replace("+", "")}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-muted">Trades today</span>
          <span className="flex items-center gap-2">
            {settings.max_trades_per_day != null && settings.max_trades_per_day <= 10 && (
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: settings.max_trades_per_day }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full ${
                      i < trades.length ? "bg-danger" : "border border-border2"
                    }`}
                  />
                ))}
              </span>
            )}
            <span className="font-mono text-xs">
              {trades.length}
              {settings.max_trades_per_day != null ? `/${settings.max_trades_per_day}` : ""}
            </span>
          </span>
        </div>
        {windows.length > 0 && (
          <div className="py-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Trading window</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  windowOpen
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-danger/40 bg-danger/10 text-danger"
                }`}
              >
                {windowOpen ? "Open" : "Closed"}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {windows.map((w) => {
                // Compact display: "07:00–09:00 London" instead of the raw
                // IANA id, which wrapped ugly at panel width.
                const times = w.raw.match(/^\S+/)?.[0]?.replace("-", "–") ?? w.raw;
                const tzShort = (w.tz.split("/").pop() ?? w.tz).replace(/_/g, " ");
                const openNow = inWindow(w, new Date());
                return (
                  <span
                    key={w.raw}
                    className="inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2 py-1 font-mono text-[11px] text-muted"
                    title={w.raw}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-success" : "bg-danger/60"}`}
                      aria-hidden="true"
                    />
                    {times} {tzShort}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="py-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Today&apos;s net PnL</span>
            <span
              className={`font-mono text-sm font-semibold ${net > 0 ? "text-success" : net < 0 ? "text-danger" : ""}`}
            >
              {moneySigned(net, cur)}
            </span>
          </div>
          {(lossCap != null || target != null) && (
            <>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-surface2">
                <div
                  className={`absolute inset-y-0 rounded-full ${net < 0 ? "bg-danger" : "bg-success"}`}
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                />
                {/* zero marker */}
                <div
                  className="absolute inset-y-0 w-px bg-border2"
                  style={{ left: `${bar.zero}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="relative mt-1 flex justify-between font-mono text-[10px] text-dim">
                <span>{lossCap != null ? `-${moneySigned(Math.abs(lossCap), cur).replace("+", "")} max loss` : ""}</span>
                {/* pinned to exactly 50% - justify-between only centres it
                    when the outer labels happen to be equal widths */}
                <span className="absolute left-1/2 -translate-x-1/2">0</span>
                <span>{target != null ? `${moneySigned(Math.abs(target), cur)} target` : ""}</span>
              </div>
            </>
          )}
        </div>
        {!settingsAvailable && (
          <p className="mt-1 text-[11px] text-gold">Apply migration 0016 to persist guardrails.</p>
        )}
        {settingsAvailable &&
          settings.max_trades_per_day == null &&
          !settings.max_daily_loss &&
          windows.length === 0 && (
            <p className="mt-1 text-[11px] text-dim">
              No guardrails set.{" "}
              <Link href="/settings" className="text-accent2 hover:underline">
                Set them in Settings
              </Link>
              .
            </p>
          )}
        {settings.warn_on_charts &&
          violations.map((v, i) => (
            <p
              key={i}
              className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                v.kind === "max_loss"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-gold/40 bg-gold/10 text-gold"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              {v.kind === "max_loss" ? "Max daily loss hit. Stop trading for today." : v.label}
            </p>
          ))}
      </div>

      {/* today's news: aware of the day before trading it */}
      {news != null && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Today&apos;s news
            </span>
            <Link href="/news" className="text-[11px] text-accent2 hover:underline">
              All news + calendar
            </Link>
          </div>
          <div className="mt-2 space-y-1">
            {news.length === 0 && <p className="py-1 text-xs text-dim">Nothing published yet today.</p>}
            {news.map((n) => (
              <Link
                key={n.link}
                href="/news"
                className="block rounded-lg px-1.5 py-1.5 transition hover:bg-surface2"
                title="Open the News page"
              >
                <span className="line-clamp-2 text-xs leading-snug">{n.title}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-dim">
                  {n.source}
                  {!Number.isNaN(new Date(n.pubDate).getTime()) &&
                    ` · ${new Date(n.pubDate).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* watchlist: one-click symbol switching */}
      {onPickSymbol && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Watchlist</span>
            <Link href="/settings?tab=pairs" className="text-[11px] text-accent2 hover:underline">
              Edit
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {watchlist.map((label) => {
              const tv = tvSymbolFor(label);
              if (!tv) return null;
              const active = tv === currentTv;
              return (
                <button
                  key={label}
                  onClick={() => onPickSymbol(tv)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                    active
                      ? "border-accent bg-accent-soft text-accent2"
                      : "border-border text-muted hover:border-accent hover:text-foreground"
                  }`}
                >
                  <PairFlag pair={label} size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* today's trades */}
      <div className="flex-1 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Today&apos;s trades
          </span>
          <Link href="/journal" className="text-[11px] text-accent2 hover:underline">
            Journal
          </Link>
        </div>
        <div className="mt-2 space-y-0.5">
          {trades.length === 0 && <p className="py-2 text-xs text-dim">Nothing logged today.</p>}
          {trades.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/journal/trade/${t.id}`)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface2"
            >
              <PairFlag pair={t.pair} size={16} />
              <span className="truncate text-sm">{t.pair ?? "Trade"}</span>
              {t.traded_on.length > 10 && !/T00:00(:00)?/.test(t.traded_on.slice(10, 19)) && (
                <span className="font-mono text-[10px] text-dim">{t.traded_on.slice(11, 16)}</span>
              )}
              {t.pnl != null && (
                <span
                  className={`ml-auto font-mono text-xs font-medium ${t.pnl > 0 ? "text-success" : t.pnl < 0 ? "text-danger" : "text-muted"}`}
                >
                  {moneySigned(t.pnl, cur)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: docked right panel, collapsible to a slim rail. */}
      <div
        className={`hidden shrink-0 border-l border-border bg-card transition-[width] duration-200 md:flex md:flex-col ${
          collapsed ? "w-10" : "w-[300px]"
        }`}
      >
        <div className={`flex items-center border-b border-border ${collapsed ? "justify-center py-2" : "justify-between px-4 py-2.5"}`}>
          {!collapsed && (
            <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Trading day
            </span>
          )}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand trading day panel" : "Collapse trading day panel"}
            aria-label={collapsed ? "Expand trading day panel" : "Collapse trading day panel"}
            className="rounded-md p-1.5 text-muted transition hover:bg-surface2 hover:text-foreground"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={collapsed ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
            </svg>
          </button>
        </div>
        {!collapsed && body}
        {collapsed && violations.length > 0 && settings.warn_on_charts && (
          <div className="flex justify-center pt-2" title={violations.map((v) => v.label).join("; ")}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet from the toolbar button. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onMobileClose();
          }}
        >
          <div className="max-h-[80dvh] w-full overflow-hidden rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] ring-1 ring-border2">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-medium" style={{ fontFamily: "var(--font-display)" }}>
                Trading day
              </span>
              <button onClick={onMobileClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:text-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="max-h-[calc(80dvh-52px)] overflow-y-auto">{body}</div>
          </div>
        </div>
      )}
    </>
  );
}
