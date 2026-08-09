// Manual backtesting (bar replay): shared types, timeframe catalog, trade
// resolution and session stats. Pure functions, no IO - keep it that way so
// the replay UI and any future automated backtester share one engine.

export type Candle = {
  t: number; // bar open time, unix seconds UTC
  o: number;
  h: number;
  l: number;
  c: number;
};

// Full set both data providers can serve (intersection of Twelve Data and
// Binance intervals - that's the real constraint, not a UI choice; 3m and 45m
// exist on only one side each, so they're out).
export type Timeframe =
  | "1m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h"
  | "1d" | "1w";

export const TIMEFRAMES: { id: Timeframe; label: string; seconds: number }[] = [
  { id: "1m", label: "1 minute", seconds: 60 },
  { id: "5m", label: "5 minutes", seconds: 300 },
  { id: "15m", label: "15 minutes", seconds: 900 },
  { id: "30m", label: "30 minutes", seconds: 1800 },
  { id: "1h", label: "1 hour", seconds: 3600 },
  { id: "2h", label: "2 hours", seconds: 7200 },
  { id: "4h", label: "4 hours", seconds: 14400 },
  { id: "1d", label: "Daily", seconds: 86400 },
  { id: "1w", label: "Weekly", seconds: 604800 },
];

export const tfSeconds = (tf: Timeframe) =>
  TIMEFRAMES.find((t) => t.id === tf)?.seconds ?? 3600;

export type BtOutcome = "open" | "tp" | "sl" | "manual";

export type BtTrade = {
  id: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number | null;
  exit: number | null;
  enteredAt: number; // unix seconds (bar time)
  exitedAt: number | null;
  outcome: BtOutcome;
  r: number | null;
  pnl: number | null;
  notes?: string | null;
};

// R multiple of an exit. Positive = win, negative = loss, sign handled per
// direction. Returns null when the stop distance is zero (bad input).
export function rMultiple(
  direction: "long" | "short",
  entry: number,
  stop: number,
  exit: number
): number | null {
  const riskDist = direction === "long" ? entry - stop : stop - entry;
  if (!(riskDist > 0)) return null;
  const gain = direction === "long" ? exit - entry : entry - exit;
  return gain / riskDist;
}

// Does this bar close the trade? Checks the bar's full high-low range.
// Conservative rule: if a single bar sweeps BOTH stop and target, count the
// stop first - real fills usually favour the worst case, and a backtester
// that flatters you is worse than none.
export function resolveTradeOnBar(
  trade: Pick<BtTrade, "direction" | "stop" | "target">,
  bar: Candle
): { exit: number; outcome: "sl" | "tp" } | null {
  if (trade.direction === "long") {
    if (bar.l <= trade.stop) return { exit: trade.stop, outcome: "sl" };
    if (trade.target != null && bar.h >= trade.target)
      return { exit: trade.target, outcome: "tp" };
  } else {
    if (bar.h >= trade.stop) return { exit: trade.stop, outcome: "sl" };
    if (trade.target != null && bar.l <= trade.target)
      return { exit: trade.target, outcome: "tp" };
  }
  return null;
}

export type BtStats = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null; // 0..100
  avgR: number | null;
  totalR: number;
  expectancyR: number | null; // win% x avg win R - loss% x avg loss R
  pnl: number; // flat risk: startingBalance * riskPct% per trade
  riskAmount: number;
  equity: number[]; // balance after each closed trade, starts at startingBalance
};

// Session stats over CLOSED trades. PnL uses flat risk on the starting
// balance (not compounding) - one clean assumption, stated in the UI.
export function computeStats(
  trades: BtTrade[],
  startingBalance: number,
  riskPct: number
): BtStats {
  const closed = trades.filter((t) => t.outcome !== "open" && t.r != null);
  const riskAmount = (startingBalance * riskPct) / 100;
  const rs = closed.map((t) => t.r as number);
  const wins = rs.filter((r) => r > 0.05);
  const losses = rs.filter((r) => r < -0.05);
  const breakeven = rs.length - wins.length - losses.length;
  const totalR = rs.reduce((a, b) => a + b, 0);
  const decisive = wins.length + losses.length;
  const winRate = decisive ? (wins.length / decisive) * 100 : null;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length)
    : 0;
  const expectancyR = decisive
    ? (wins.length / decisive) * avgWin - (losses.length / decisive) * avgLoss
    : null;

  const equity = [startingBalance];
  let bal = startingBalance;
  for (const r of rs) {
    bal += riskAmount * r;
    equity.push(bal);
  }

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate,
    avgR: rs.length ? totalR / rs.length : null,
    totalR,
    expectancyR,
    pnl: riskAmount * totalR,
    riskAmount,
    equity,
  };
}

// Sensible decimal places for price display per pair, mirroring the risk page.
export function priceDecimalsFor(pair: string) {
  if (pair.includes("JPY")) return 3;
  if (pair.startsWith("XAU") || pair.startsWith("BTC") || pair.startsWith("ETH")) return 2;
  if (!pair.includes("/")) return 1; // indices / energy
  return 5;
}
