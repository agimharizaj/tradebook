import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { moneySigned, sym } from "@/lib/format";
import { DailyBars, EquityCurve, HBars } from "@/components/dashboard/Charts";
import KillZones from "@/components/sessions/KillZones";
import DashboardAccountBar from "@/components/dashboard/DashboardAccountBar";

export const dynamic = "force-dynamic";

type Trade = {
  pnl: number | null;
  r_multiple: number | null;
  traded_on: string;
  created_at: string;
  pair: string | null;
  direction: string | null;
  account_id?: string | null;
};

type Account = {
  id: string;
  name: string;
  firm: string | null;
  phase: string | null;
  size: number | null;
  currency: string | null;
  status: string;
  hidden?: boolean;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sp = await searchParams;

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.display_name as string) ?? (meta.full_name as string) ?? "";

  // Accounts (migration 0019); tolerate the table not existing yet.
  // select * so optional columns (hidden, 0020) don't break older databases.
  const accountsRes = await supabase
    .from("accounts")
    .select("*")
    .order("started_on", { ascending: false });
  const accounts = (accountsRes.error ? [] : ((accountsRes.data as Account[]) ?? []));
  // Scope: explicit ?account= wins; otherwise the device-wide selection
  // mirrored into a cookie, so the first server render is already scoped.
  const cookieSel = (await cookies()).get("tb_account")?.value;
  const wanted = sp.account ?? (cookieSel && cookieSel !== "all" ? cookieSel : undefined);
  const selected = accounts.find((a) => a.id === wanted) ?? null;

  // All trades once (with account_id when the column exists) - the selected
  // scope filters in memory and the per-account cards need the full set.
  let tradesRes = await supabase
    .from("trades")
    .select("pnl, r_multiple, traded_on, created_at, pair, direction, account_id")
    .order("traded_on", { ascending: true })
    .order("created_at", { ascending: true });
  if (tradesRes.error) {
    // account_id ships code-first (0019): the row shape without it still
    // satisfies Trade (the field is optional), so the cast is safe.
    tradesRes = (await supabase
      .from("trades")
      .select("pnl, r_multiple, traded_on, created_at, pair, direction")
      .order("traded_on", { ascending: true })
      .order("created_at", { ascending: true })) as typeof tradesRes;
  }
  const loadError = tradesRes.error;
  const allTrades = (tradesRes.data as Trade[]) ?? [];
  const trades = selected ? allTrades.filter((t) => t.account_id === selected.id) : allTrades;

  const cur = selected?.currency ?? ((meta.account_currency as string) || "USD");
  const metaSize = parseFloat((meta.account_size as string) ?? "");
  const accountSize = selected?.size ?? metaSize;

  const withPnl = trades.filter((t) => t.pnl != null) as (Trade & { pnl: number })[];
  const wins = withPnl.filter((t) => t.pnl > 0);
  const losses = withPnl.filter((t) => t.pnl < 0);
  const net = withPnl.reduce((s, t) => s + t.pnl, 0);
  const decided = wins.length + losses.length;
  const winRate = decided ? (wins.length / decided) * 100 : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;
  const best = withPnl.length ? Math.max(...withPnl.map((t) => t.pnl)) : 0;
  const worst = withPnl.length ? Math.min(...withPnl.map((t) => t.pnl)) : 0;
  const avgPerTrade = withPnl.length ? net / withPnl.length : 0;
  const growthPct = accountSize > 0 ? (net / accountSize) * 100 : null;
  const rVals = trades.filter((t) => t.r_multiple != null).map((t) => t.r_multiple as number);
  const avgR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;

  // Equity curve (balance if account size known, else cumulative PnL).
  let run = accountSize > 0 ? accountSize : 0;
  const equity = withPnl.map((t) => (run += t.pnl));
  const curveStart = accountSize > 0 ? accountSize : 0;
  const balance = accountSize > 0 ? accountSize + net : null;

  // Max drawdown: largest peak-to-trough drop along the equity curve.
  let peak = curveStart;
  let maxDd = 0;
  let maxDdPct = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDd) {
      maxDd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Daily net PnL (traded_on may be a date or a timestamp; key on the date part).
  const dayMap = new Map<string, number>();
  withPnl.forEach((t) => {
    const k = t.traded_on.slice(0, 10);
    dayMap.set(k, (dayMap.get(k) ?? 0) + t.pnl);
  });
  const days = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // PnL by pair: top 8 by absolute net, displayed best to worst.
  const pairMap = new Map<string, { net: number; count: number; wins: number }>();
  withPnl.forEach((t) => {
    const k = t.pair || "Untagged";
    const v = pairMap.get(k) ?? { net: 0, count: 0, wins: 0 };
    v.net += t.pnl;
    v.count += 1;
    if (t.pnl > 0) v.wins += 1;
    pairMap.set(k, v);
  });
  const pairRows = Array.from(pairMap.entries())
    .sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))
    .slice(0, 8)
    .sort((a, b) => b[1].net - a[1].net);

  // Day-of-week performance (Mon first).
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ d, net: 0, count: 0, wins: 0 }));
  withPnl.forEach((t) => {
    const dt = new Date(`${t.traded_on.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return;
    const i = (dt.getDay() + 6) % 7;
    dow[i].net += t.pnl;
    dow[i].count += 1;
    if (t.pnl > 0) dow[i].wins += 1;
  });
  const dowRows = dow.filter((x) => x.count > 0);

  // Long vs short, and longest win/loss streaks (chronological).
  const longs = withPnl.filter((t) => t.direction === "long");
  const shorts = withPnl.filter((t) => t.direction === "short");
  const netOf = (a: { pnl: number }[]) => a.reduce((sm, t) => sm + t.pnl, 0);
  let curW = 0, curL = 0, maxW = 0, maxL = 0;
  withPnl.forEach((t) => {
    if (t.pnl > 0) { curW += 1; curL = 0; } else if (t.pnl < 0) { curL += 1; curW = 0; }
    if (curW > maxW) maxW = curW;
    if (curL > maxL) maxL = curL;
  });

  const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const equityDates = withPnl.map((t) => t.traded_on.slice(0, 10));

  // Per-account cards (hidden accounts stay off the dashboard; their trades
  // still count in the combined numbers).
  const accountCards = accounts.filter((a) => !a.hidden || a.id === selected?.id).map((a) => {
    const at = allTrades.filter((t) => t.account_id === a.id && t.pnl != null);
    const aNet = at.reduce((s, t) => s + (t.pnl as number), 0);
    return { ...a, net: aNet, count: at.length, balance: a.size != null ? a.size + aNet : null };
  });

  const statusTone = (s: string) =>
    s === "active"
      ? "border-accent/50 bg-accent-soft text-accent2"
      : s === "passed"
        ? "border-success/40 bg-success/10 text-success"
        : s === "failed"
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border2 text-dim";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">{name ? `Welcome back, ${name.split(" ")[0]}` : "Dashboard"}</h1>
          <p className="mt-1 text-muted">
            {selected ? (
              <>Viewing <span className="text-foreground">{selected.name}</span></>
            ) : accounts.length > 0 ? (
              "All accounts combined."
            ) : (
              "Your trading workspace at a glance."
            )}
          </p>
        </div>
        <Suspense fallback={null}>
          <DashboardAccountBar />
        </Suspense>
      </div>

      {loadError && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Could not load trades: {loadError.message}. The stats below may be incomplete.
        </p>
      )}

      {/* hero: balance + equity curve in one band - always shown; a fresh
          account's balance (its size) matters before any trade exists. With
          fewer than two PnL trades the curve column is dropped entirely so a
          fresh account gets a compact card, not a tall empty box. */}
      <div
        className={`mt-6 grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-border ${
          equity.length >= 2 ? "lg:grid-cols-[280px_1fr]" : ""
        }`}
      >
        <div
          className={`flex flex-col justify-center ${
            equity.length >= 2 ? "border-border lg:border-r lg:pr-5" : ""
          }`}
        >
          <div className="text-xs uppercase tracking-wide text-dim">
            {selected ? `${selected.name} balance` : "Balance"}
          </div>
          <div
            className={`mt-1 text-3xl font-semibold ${net > 0 ? "text-success" : net < 0 ? "text-danger" : ""}`}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {balance != null
              ? `${sym(cur)}${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "—"}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip label="Net" value={moneySigned(net, cur)} tone={net >= 0 ? "up" : "down"} />
            {growthPct != null && (
              <Chip label="Growth" value={pct(growthPct)} tone={growthPct >= 0 ? "up" : "down"} />
            )}
            {avgR != null && (
              <Chip label="Avg R" value={`${avgR.toFixed(2)}R`} tone={avgR >= 0 ? "up" : "down"} />
            )}
          </div>
          {balance == null && (
            <p className="mt-3 text-xs text-dim">
              Set an account size in{" "}
              <Link href="/settings?tab=accounts" className="text-accent2">Settings</Link> to
              track balance.
            </p>
          )}
          {equity.length < 2 && (
            <p className="mt-3 text-xs text-dim">
              Your balance curve appears here after two trades with PnL.
            </p>
          )}
        </div>
        {equity.length >= 2 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                {accountSize > 0 ? "Balance curve" : "Cumulative PnL"}
              </h2>
              <span className="font-mono text-sm text-muted">
                {accountSize > 0
                  ? `${sym(cur)}${equity[equity.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : moneySigned(net, cur)}
              </span>
            </div>
            <EquityCurve values={equity} baseline={curveStart} dates={equityDates} cur={cur} />
          </div>
        )}
      </div>

          {/* accounts strip: only when there's an actual choice to make - a
              single card would just repeat the hero's numbers */}
          {accountCards.length > 1 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accountCards.map((a) => (
                <Link
                  key={a.id}
                  href={selected?.id === a.id ? "/dashboard" : `/dashboard?account=${a.id}`}
                  className={`rounded-xl bg-card p-4 ring-1 transition hover:ring-accent ${
                    selected?.id === a.id ? "ring-accent" : "ring-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{a.name}</span>
                    {a.phase && (
                      <span className="rounded-full border border-border2 px-1.5 py-0.5 text-[9px] capitalize text-muted">
                        {a.phase}
                      </span>
                    )}
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${statusTone(a.status)}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-sm font-medium ${a.net > 0 ? "text-success" : a.net < 0 ? "text-danger" : "text-muted"}`}
                    >
                      {moneySigned(a.net, a.currency ?? cur)}
                    </span>
                    <span className="font-mono text-[11px] text-dim">
                      {a.balance != null
                        ? `bal ${sym(a.currency ?? cur)}${a.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : `${a.count} trades`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

      {/* stats and charts wait for trades; the hero and account cards above
          always render */}
      {withPnl.length > 0 ? (
        <>
          {/* stat tiles */}
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} />
            <Stat label="Profit factor" value={profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} />
            <Stat label="Trades" value={String(trades.length)} />
            <Stat label="Avg / trade" value={moneySigned(avgPerTrade, cur)} tone={avgPerTrade >= 0 ? "up" : "down"} />
            <Stat label="Best" value={moneySigned(best, cur)} tone="up" />
            <Stat label="Worst" value={moneySigned(worst, cur)} tone="down" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Daily PnL</h2>
              <DailyBars days={days} cur={cur} />
            </div>
            {dowRows.length > 0 && (
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
                <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">Day of week</h2>
                <HBars
                  rows={dowRows.map((x) => ({ label: x.d, value: x.net, count: x.count, wins: x.wins }))}
                  cur={cur}
                />
              </div>
            )}
          </div>

          {pairRows.length > 0 && (
            <div className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-border">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">PnL by pair</h2>
              <HBars
                rows={pairRows.map(([pr, v]) => ({ label: pr, value: v.net, count: v.count, wins: v.wins }))}
                cur={cur}
              />
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-border">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">Breakdown</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Mini label="Wins" value={String(wins.length)} />
              <Mini label="Losses" value={String(losses.length)} />
              <Mini label="Avg win" value={moneySigned(avgWin, cur)} tone="up" />
              <Mini label="Avg loss" value={moneySigned(avgLoss, cur)} tone="down" />
              <Mini
                label="Max drawdown"
                value={maxDd > 0 ? moneySigned(-maxDd, cur) : moneySigned(0, cur)}
                tone={maxDd > 0 ? "down" : undefined}
              />
              <Mini
                label="Max drawdown %"
                value={curveStart > 0 && maxDd > 0 ? `-${maxDdPct.toFixed(2)}%` : "—"}
                tone={maxDd > 0 && curveStart > 0 ? "down" : undefined}
              />
              <Mini label={`Longs (${longs.length})`} value={moneySigned(netOf(longs), cur)} tone={netOf(longs) >= 0 ? "up" : "down"} />
              <Mini label={`Shorts (${shorts.length})`} value={moneySigned(netOf(shorts), cur)} tone={netOf(shorts) >= 0 ? "up" : "down"} />
              <Mini label="Max win streak" value={String(maxW)} tone="up" />
              <Mini label="Max loss streak" value={String(maxL)} tone="down" />
            </div>
          </div>

          <div className="mt-6">
            <KillZones />
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-card px-5 py-8 text-center ring-1 ring-border">
          <p className="text-sm text-muted">
            No trades logged yet{selected ? ` on ${selected.name}` : ""}. Stats and charts appear
            after your first trade.
          </p>
          <Link
            href="/journal"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Add or import trades
          </Link>
        </div>
      )}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-surface2 px-2.5 py-1">
      <span className="text-[10px] uppercase tracking-wide text-dim">{label}</span>
      <span
        className={`font-mono text-xs font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
      >
        {value}
      </span>
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <div className="text-xs text-dim">{label}</div>
      <div
        className={`mt-1 truncate text-xl font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-surface2 p-3">
      <div className="text-xs text-dim">{label}</div>
      <div
        className={`mt-0.5 truncate text-base font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}
