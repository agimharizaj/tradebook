import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moneySigned, sym } from "@/lib/format";
import { DailyBars, EquityCurve } from "@/components/dashboard/Charts";

export const dynamic = "force-dynamic";

type Trade = { pnl: number | null; traded_on: string; created_at: string; pair: string | null; direction: string | null };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.display_name as string) ?? (meta.full_name as string) ?? "";
  const cur = (meta.account_currency as string) || "USD";
  const accountSize = parseFloat((meta.account_size as string) ?? "");

  const { data, error: loadError } = await supabase
    .from("trades")
    .select("pnl, traded_on, created_at, pair, direction")
    .order("traded_on", { ascending: true })
    .order("created_at", { ascending: true });
  const trades = (data as Trade[]) ?? [];

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

  // Equity curve (balance if account size known, else cumulative PnL).
  let run = accountSize > 0 ? accountSize : 0;
  const equity = withPnl.map((t) => (run += t.pnl));
  const curveStart = accountSize > 0 ? accountSize : 0;

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
  const pairMap = new Map<string, { net: number; count: number }>();
  withPnl.forEach((t) => {
    const k = t.pair || "Untagged";
    const v = pairMap.get(k) ?? { net: 0, count: 0 };
    v.net += t.pnl;
    v.count += 1;
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
  // Dates matching each equity point, for the curve's x-axis labels.
  const equityDates = withPnl.map((t) => t.traded_on.slice(0, 10));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-2xl">{name ? `Welcome back, ${name.split(" ")[0]}` : "Dashboard"}</h1>
      <p className="mt-1 text-muted">Your trading workspace at a glance.</p>

      {loadError && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Could not load trades: {loadError.message}. The stats below may be incomplete.
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Net PnL" value={moneySigned(net, cur)} tone={net >= 0 ? "up" : "down"} />
        <Stat
          label="Account growth"
          value={growthPct == null ? "—" : pct(growthPct)}
          tone={growthPct == null ? undefined : growthPct >= 0 ? "up" : "down"}
        />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} />
        <Stat label="Profit factor" value={profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} />
        <Stat label="Trades" value={String(trades.length)} />
        <Stat label="Avg / trade" value={moneySigned(avgPerTrade, cur)} tone={avgPerTrade >= 0 ? "up" : "down"} />
      </div>

      {growthPct == null && (
        <p className="mt-3 text-xs text-dim">
          Set your account size in <Link href="/profile" className="text-accent2">your profile</Link> to see account growth.
        </p>
      )}

      {equity.length >= 2 ? (
        <>
          <div className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-border">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                {accountSize > 0 ? "Balance curve" : "Cumulative PnL"}
              </h2>
              <span className="font-mono text-sm text-muted">
                {accountSize > 0 ? `${sym(cur)}${equity[equity.length - 1].toLocaleString(undefined, { maximumFractionDigits: 0 })}` : moneySigned(net, cur)}
              </span>
            </div>
            <EquityCurve values={equity} baseline={curveStart} dates={equityDates} cur={cur} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Daily PnL</h2>
              <DailyBars days={days} cur={cur} />
            </div>
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">Breakdown</h2>
              <div className="grid grid-cols-2 gap-3">
                <Mini label="Wins" value={String(wins.length)} />
                <Mini label="Losses" value={String(losses.length)} />
                <Mini label="Avg win" value={moneySigned(avgWin, cur)} tone="up" />
                <Mini label="Avg loss" value={moneySigned(avgLoss, cur)} tone="down" />
                <Mini label="Best" value={moneySigned(best, cur)} tone="up" />
                <Mini label="Worst" value={moneySigned(worst, cur)} tone="down" />
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
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {pairRows.length > 0 && (
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
                <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">PnL by pair</h2>
                <HBars
                  rows={pairRows.map(([pr, v]) => ({ label: pr, value: v.net, sub: `${v.count} trade${v.count === 1 ? "" : "s"}` }))}
                  cur={cur}
                />
              </div>
            )}
            {dowRows.length > 0 && (
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
                <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">Day of week</h2>
                <HBars
                  rows={dowRows.map((x) => ({ label: x.d, value: x.net, sub: `${x.count} · ${Math.round((x.wins / x.count) * 100)}% win` }))}
                  cur={cur}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-dim">
          No trades logged yet. Head to the <Link href="/journal" className="text-accent2">Journal</Link> to add or import trades.
        </p>
      )}

    </div>
  );
}

// Horizontal bar rows: label + optional sub-line, bar scaled to the largest
// absolute value, monospace signed figure on the right.
function HBars({ rows, cur }: { rows: { label: string; value: number; sub?: string }[]; cur: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-20 shrink-0">
            <div className="truncate font-mono text-xs">{r.label}</div>
            {r.sub && <div className="text-[10px] text-dim">{r.sub}</div>}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`,
                background: r.value >= 0 ? "var(--success)" : "var(--danger)",
              }}
            />
          </div>
          <div className={`w-24 shrink-0 text-right font-mono text-xs ${r.value >= 0 ? "text-success" : "text-danger"}`}>
            {moneySigned(r.value, cur)}
          </div>
        </div>
      ))}
    </div>
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
