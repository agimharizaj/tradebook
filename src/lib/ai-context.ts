// Builds the compact data snapshot injected into the AI assistant's system
// prompt. Runs server-side only (called from /api/ai) with the signed-in
// user's Supabase client, so RLS guarantees the model only ever sees the
// requesting user's rows. Target: well under ~8k tokens even with a full
// journal, so aggregates + the last 50 trades, never the whole table.
import type { SupabaseClient, User } from "@supabase/supabase-js";

type TradeRow = {
  pnl: number | null;
  r_multiple: number | null;
  pair: string | null;
  direction: string | null;
  traded_on: string;
  size_lots: number | null;
  emotion: string | null;
  notes: string | null;
  strategy_id: string | null;
};

type StrategyRow = {
  id: string;
  name: string;
  plan_type: string | null;
  is_active: boolean;
  max_trades_per_day: number | null;
  max_daily_loss: number | null;
  max_daily_profit: number | null;
  risk_per_trade_pct: number | null;
  trading_window: string | null;
  trading_window_2: string | null;
  strategy_date: string | null;
};

type LineRow = { strategy_id: string; content: string; sort_order: number };

const n1 = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const pctOf = (part: number, whole: number) => (whole ? ((part / whole) * 100).toFixed(1) + "%" : "n/a");

function lines(rows: LineRow[] | null, strategyId: string): string {
  const list = (rows ?? [])
    .filter((r) => r.strategy_id === strategyId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => `- ${r.content}`);
  return list.length ? list.join("\n") : "- (none written)";
}

export async function buildAiContext(supabase: SupabaseClient, user: User): Promise<string> {
  const [tradesRes, stratRes, entryRes, exitRes, tmrRes, notesRes, analysesRes, newsRes] = await Promise.all([
    supabase
      .from("trades")
      .select("pnl, r_multiple, pair, direction, traded_on, size_lots, emotion, notes, strategy_id")
      .order("traded_on", { ascending: true }),
    supabase.from("strategies").select(
      "id, name, plan_type, is_active, max_trades_per_day, max_daily_loss, max_daily_profit, risk_per_trade_pct, trading_window, trading_window_2, strategy_date"
    ),
    supabase.from("entry_criteria").select("strategy_id, content, sort_order"),
    supabase.from("exit_criteria").select("strategy_id, content, sort_order"),
    supabase.from("trade_management_rules").select("strategy_id, content, sort_order"),
    supabase
      .from("notes")
      .select("title, content, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("chart_analyses")
      .select("symbol, timeframe, direction, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("news_items")
      .select("title, source, published_at")
      .order("published_at", { ascending: false })
      .limit(15),
  ]);

  const trades = (tradesRes.data as TradeRow[]) ?? [];
  const strategies = (stratRes.data as StrategyRow[]) ?? [];
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cur = (meta.account_currency as string) || "USD";
  const accountSize = parseFloat((meta.account_size as string) ?? "");

  const withPnl = trades.filter((t) => t.pnl != null) as (TradeRow & { pnl: number })[];
  const wins = withPnl.filter((t) => t.pnl > 0);
  const losses = withPnl.filter((t) => t.pnl < 0);
  const net = withPnl.reduce((s, t) => s + t.pnl, 0);
  const decided = wins.length + losses.length;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = decided ? wins.length / decided : 0;
  // True expectancy per trade (same formula as the Journal page).
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const rVals = withPnl.map((t) => t.r_multiple).filter((r): r is number => r != null);
  const avgR = rVals.length ? rVals.reduce((s, r) => s + r, 0) / rVals.length : null;
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  let curW = 0, curL = 0, maxW = 0, maxL = 0;
  withPnl.forEach((t) => {
    if (t.pnl > 0) { curW += 1; curL = 0; } else if (t.pnl < 0) { curL += 1; curW = 0; }
    maxW = Math.max(maxW, curW);
    maxL = Math.max(maxL, curL);
  });

  // Per-pair and per-weekday breakdowns.
  const pairMap = new Map<string, { net: number; count: number; wins: number }>();
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ d, net: 0, count: 0, wins: 0 }));
  const dayMap = new Map<string, { net: number; count: number }>();
  withPnl.forEach((t) => {
    const k = t.pair || "Untagged";
    const v = pairMap.get(k) ?? { net: 0, count: 0, wins: 0 };
    v.net += t.pnl; v.count += 1; if (t.pnl > 0) v.wins += 1;
    pairMap.set(k, v);
    const date = t.traded_on.slice(0, 10);
    const dt = new Date(`${date}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      const i = (dt.getDay() + 6) % 7;
      dow[i].net += t.pnl; dow[i].count += 1; if (t.pnl > 0) dow[i].wins += 1;
    }
    const dv = dayMap.get(date) ?? { net: 0, count: 0 };
    dv.net += t.pnl; dv.count += 1;
    dayMap.set(date, dv);
  });

  const pairLines = Array.from(pairMap.entries())
    .sort((a, b) => b[1].net - a[1].net)
    .map(([p, v]) => `${p}: ${v.count} trades, win rate ${pctOf(v.wins, v.count)}, net ${n1(v.net)} ${cur}`);
  const dowLines = dow
    .filter((x) => x.count > 0)
    .map((x) => `${x.d}: ${x.count} trades, win rate ${pctOf(x.wins, x.count)}, net ${n1(x.net)} ${cur}`);

  // Risk-rule breach days, judged against the active strategy's limits
  // (falls back to the first strategy that defines a limit).
  const limits =
    strategies.find((s) => s.is_active && (s.max_trades_per_day != null || s.max_daily_loss != null)) ??
    strategies.find((s) => s.max_trades_per_day != null || s.max_daily_loss != null);
  const breachLines: string[] = [];
  if (limits) {
    for (const [date, v] of Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (limits.max_trades_per_day != null && v.count > limits.max_trades_per_day) {
        breachLines.push(`${date}: ${v.count} trades (cap ${limits.max_trades_per_day})`);
      }
      if (limits.max_daily_loss != null && v.net < -Math.abs(limits.max_daily_loss)) {
        breachLines.push(`${date}: net ${n1(v.net)} ${cur} (daily loss cap ${n1(Math.abs(limits.max_daily_loss))})`);
      }
    }
  }

  const stratBlocks = strategies.map((s) => {
    const rc: string[] = [];
    if (s.max_trades_per_day != null) rc.push(`max trades/day ${s.max_trades_per_day}`);
    if (s.max_daily_loss != null) rc.push(`max daily loss ${n1(Math.abs(s.max_daily_loss))} ${cur}`);
    if (s.max_daily_profit != null) rc.push(`max daily profit ${n1(s.max_daily_profit)} ${cur}`);
    if (s.risk_per_trade_pct != null) rc.push(`risk per trade ${s.risk_per_trade_pct}%`);
    if (s.trading_window) rc.push(`trading window ${s.trading_window}`);
    if (s.trading_window_2) rc.push(`second window ${s.trading_window_2}`);
    return [
      `### Strategy: ${s.name}${s.plan_type ? ` (${s.plan_type})` : ""}${s.is_active ? " [active]" : ""}${s.strategy_date ? ` [date: ${s.strategy_date}]` : ""} [id: ${s.id}]`,
      `Risk controls: ${rc.length ? rc.join(", ") : "(none set)"}`,
      `Entry criteria:\n${lines(entryRes.data as LineRow[], s.id)}`,
      `Exit criteria:\n${lines(exitRes.data as LineRow[], s.id)}`,
      `Trade management rules:\n${lines(tmrRes.data as LineRow[], s.id)}`,
    ].join("\n");
  });

  const stratName = new Map(strategies.map((s) => [s.id, s.name]));
  const recent = [...trades]
    .slice(-50)
    .reverse()
    .map((t) => {
      const bits = [
        t.traded_on.slice(0, 16).replace("T", " "),
        t.pair ?? "?",
        t.direction ?? "?",
        t.pnl != null ? `pnl ${n1(t.pnl)}` : "pnl n/a",
        t.r_multiple != null ? `${t.r_multiple}R` : null,
        t.size_lots != null ? `${t.size_lots} lots` : null,
        t.strategy_id ? stratName.get(t.strategy_id) : null,
        t.emotion ? `emotion: ${t.emotion}` : null,
        t.notes ? `note: ${t.notes.slice(0, 80)}` : null,
      ].filter(Boolean);
      return `- ${bits.join(" | ")}`;
    });

  const noteBlocks = (
    (notesRes.data as { title: string; content: string | null; updated_at: string }[]) ?? []
  ).map((x) => {
    const body = (x.content ?? "").trim();
    const capped = body.length > 1200 ? body.slice(0, 1200) + " …(truncated)" : body;
    return `### Note: ${x.title} (updated ${x.updated_at.slice(0, 10)})\n${capped || "(empty)"}`;
  });

  const analysisLines = (
    (analysesRes.data as {
      symbol: string;
      timeframe: string | null;
      direction: string | null;
      notes: string | null;
      created_at: string;
    }[]) ?? []
  ).map((a) => {
    const body = (a.notes ?? "").trim();
    const capped = body.length > 600 ? body.slice(0, 600) + " …(truncated)" : body;
    return `- ${a.created_at.slice(0, 10)} ${a.symbol}${a.timeframe ? ` ${a.timeframe}` : ""}${a.direction ? ` (${a.direction})` : ""}: ${capped || "(no text, screenshot only)"}`;
  });

  // Recent market headlines the app has archived (News page). Lets Sidekick
  // explain "the news" the trader is looking at. Table may not exist before
  // migration 0007; the error branch just yields an empty list.
  const newsLines = (
    (newsRes.data as { title: string; source: string | null; published_at: string | null }[]) ?? []
  ).map(
    (x) => `- ${(x.published_at ?? "").slice(0, 10)}${x.source ? ` [${x.source}]` : ""} ${x.title}`
  );

  return [
    `## Account`,
    `Currency: ${cur}.${accountSize > 0 ? ` Account size: ${n1(accountSize)} ${cur}.` : ""} Trades logged: ${trades.length} (${withPnl.length} with PnL).`,
    ``,
    `## Lifetime summary (all trades with PnL)`,
    withPnl.length
      ? [
          `Net PnL: ${n1(net)} ${cur}. Win rate: ${pctOf(wins.length, decided)} (${wins.length}W / ${losses.length}L).`,
          `Profit factor: ${profitFactor === Infinity ? "inf" : n1(profitFactor)}. Expectancy per trade: ${n1(expectancy)} ${cur}.${avgR != null ? ` Avg R: ${n1(avgR)}.` : ""}`,
          `Avg win: ${n1(avgWin)} ${cur}. Avg loss: ${n1(avgLoss)} ${cur}. Longest win streak: ${maxW}. Longest loss streak: ${maxL}.`,
        ].join("\n")
      : `No trades with PnL logged yet.`,
    ``,
    `## By pair`,
    pairLines.length ? pairLines.join("\n") : "(no data)",
    ``,
    `## By weekday`,
    dowLines.length ? dowLines.join("\n") : "(no data)",
    ``,
    `## Risk-rule breach days${limits ? ` (limits from "${limits.name}")` : ""}`,
    limits ? (breachLines.length ? breachLines.join("\n") : "None found.") : "No risk limits defined in any strategy.",
    ``,
    `## Strategies (${strategies.length})`,
    stratBlocks.length ? stratBlocks.join("\n\n") : "(none created yet)",
    ``,
    `## Most recent trades (up to 50, newest first)`,
    recent.length ? recent.join("\n") : "(none)",
    ``,
    `## Chart analysis log (latest ${analysisLines.length})`,
    analysisLines.length ? analysisLines.join("\n") : "(none)",
    ``,
    `## Notebook notes (latest ${noteBlocks.length}, full text)`,
    noteBlocks.length ? noteBlocks.join("\n\n") : "(none)",
    ``,
    `## Recent market headlines (latest ${newsLines.length}, from the News page)`,
    newsLines.length ? newsLines.join("\n") : "(none archived yet)",
  ].join("\n");
}
