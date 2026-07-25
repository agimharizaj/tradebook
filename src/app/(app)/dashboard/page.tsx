import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { moneySigned, sym } from "@/lib/format";

export const dynamic = "force-dynamic";

type Trade = { pnl: number | null; traded_on: string; created_at: string };

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
    .select("pnl, traded_on, created_at")
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

  const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-10">
      <h1 className="text-2xl">{name ? `Welcome back, ${name.split(" ")[0]}` : "Dashboard"}</h1>
      <p className="mt-1 text-muted">Your trading workspace at a glance.</p>

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
            <EquityCurve values={equity} baseline={curveStart} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Daily PnL</h2>
              <DailyBars days={days} />
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
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-dim">
          No trades logged yet. Head to the <Link href="/journal" className="text-accent2">Journal</Link> to add or import trades.
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card title="Strategy" body="Build and refine your trading playbooks." href="/strategy" />
        <Card title="Journal" body="Log trades and review your performance." href="/journal" />
        <Card title="Risk" body="Size positions by your account risk." href="/risk" />
      </div>
    </div>
  );
}

function EquityCurve({ values, baseline }: { values: number[]; baseline: number }) {
  const W = 900, H = 180, pad = 10;
  const all = [baseline, ...values];
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const up = values[values.length - 1] >= baseline;
  const color = up ? "var(--success)" : "var(--danger)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
      <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} stroke="var(--border2)" strokeDasharray="4 4" />
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DailyBars({ days }: { days: [string, number][] }) {
  const W = 440, H = 150, pad = 10;
  const max = Math.max(...days.map((d) => Math.abs(d[1])), 1);
  const mid = H / 2;
  const bw = (W - 2 * pad) / days.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
      <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--border2)" />
      {days.map(([d, net], i) => {
        const h = (Math.abs(net) / max) * (H / 2 - pad);
        const up = net >= 0;
        return (
          <rect
            key={d}
            x={pad + i * bw + bw * 0.15}
            width={Math.max(1, bw * 0.7)}
            y={up ? mid - h : mid}
            height={Math.max(1, h)}
            fill={up ? "var(--success)" : "var(--danger)"}
            rx="1"
          />
        );
      })}
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <div className="text-xs text-dim">{label}</div>
      <div
        className={`mt-1 text-xl font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
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
        className={`mt-0.5 text-base font-medium ${tone === "up" ? "text-success" : tone === "down" ? "text-danger" : ""}`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Card({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-card p-5 ring-1 ring-border transition hover:ring-accent">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </Link>
  );
}
