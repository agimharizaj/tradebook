// Builds the compact data snapshot injected into the AI assistant's system
// prompt. Runs server-side only (called from /api/ai) with the signed-in
// user's Supabase client, so RLS guarantees the model only ever sees the
// requesting user's rows. Target: well under ~8k tokens even with a full
// journal, so aggregates + the last 50 trades, never the whole table.
import type { SupabaseClient, User } from "@supabase/supabase-js";

type TradeRow = {
  id: string;
  account_id?: string | null;
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

type ReviewRow = {
  trade_id: string;
  plan_followed: boolean | null;
  confluences: string[] | null;
  management: string[] | null;
  mistakes: string[] | null;
  entry_emotion: string | null;
  exit_emotion: string | null;
  reflection: string | null;
  strategy_name: string | null;
};

type DayReviewRow = {
  day: string;
  plan_followed: string | null;
  note: string | null;
  routine_done: string[] | null;
};

type SettingsRow = {
  max_trades_per_day: number | null;
  max_daily_loss: string | null;
  max_daily_profit: string | null;
  trading_window: string | null;
  trading_window_2: string | null;
  routine_items: unknown;
};

type StrategyRow = {
  id: string;
  name: string;
  plan_type: string | null;
  is_active: boolean;
  max_trades_per_day: number | null;
  // Since migration 0013 these are text: either a figure ("200") or a percent
  // of account ("5%"). Resolve percents against the current account size.
  max_daily_loss: string | null;
  max_daily_profit: string | null;
  risk_per_trade_pct: string | null;
  trading_window: string | null;
  trading_window_2: string | null;
  strategy_date: string | null;
  pair: string | null;
};

type LineRow = { strategy_id: string; content: string; sort_order: number };

const n1 = (v: number) => (Math.round(v * 100) / 100).toLocaleString("en-US");
const pctOf = (part: number, whole: number) => (whole ? ((part / whole) * 100).toFixed(1) + "%" : "n/a");

// A risk limit is either a figure ("200") or a percent of account ("5%").
// Resolve to an absolute number using the account size (null if a percent
// can't be resolved because no account size is set).
function resolveAmount(v: string | null, accountSize: number): number | null {
  if (!v) return null;
  const s = v.trim();
  if (s.endsWith("%")) {
    const p = parseFloat(s.slice(0, -1));
    return Number.isNaN(p) || !(accountSize > 0) ? null : (p / 100) * accountSize;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function lines(rows: LineRow[] | null, strategyId: string): string {
  const list = (rows ?? [])
    .filter((r) => r.strategy_id === strategyId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => `- ${r.content}`);
  return list.length ? list.join("\n") : "- (none written)";
}

// Current wall-clock context: what time it is in each major session, which are
// open, and which ICT kill zone is live. Lets Sidekick actually judge
// "session active" / trading-window criteria instead of saying "cannot tell".
// Uses IANA zones, so DST is handled by the runtime.
const pad = (n: number) => String(n).padStart(2, "0");
function nowContext(): string {
  const now = new Date();
  const partsOf = (tz: string) => {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    const h = +get("hour") % 24;
    const mi = +get("minute");
    return { wd: get("weekday"), h, mi, mins: h * 60 + mi };
  };
  // Indicative session hours in each market's local time (same as the Sessions page).
  const sessions: [string, string, number, number][] = [
    ["Sydney", "Australia/Sydney", 7 * 60, 16 * 60],
    ["Tokyo", "Asia/Tokyo", 9 * 60, 18 * 60],
    ["London", "Europe/London", 8 * 60, 16 * 60 + 30],
    ["New York", "America/New_York", 8 * 60, 17 * 60],
  ];
  const sessionLines = sessions.map(([name, tz, o, c]) => {
    const { wd, h, mi, mins } = partsOf(tz);
    const weekday = wd !== "Sat" && wd !== "Sun";
    const open = weekday && mins >= o && mins < c;
    return `${name} ${pad(h)}:${pad(mi)} ${wd} (${open ? "OPEN" : "closed"})`;
  });
  // ICT kill zones in New York local time.
  const ny = partsOf("America/New_York");
  const kz: [string, number, number][] = [
    ["Asia", 20 * 60, 24 * 60],
    ["London", 2 * 60, 5 * 60],
    ["NY AM", 9 * 60 + 30, 11 * 60],
    ["NY Lunch", 12 * 60, 13 * 60],
    ["NY PM", 13 * 60 + 30, 16 * 60],
  ];
  const activeKz = kz.find(([, f, t]) => ny.mins >= f && ny.mins < t)?.[0] ?? "none";
  return [
    `Current time UTC: ${now.toISOString().slice(0, 16).replace("T", " ")}. New York: ${pad(ny.h)}:${pad(ny.mi)} ${ny.wd}.`,
    `Market sessions right now: ${sessionLines.join("; ")}.`,
    `Active ICT kill zone (New York time): ${activeKz}.`,
    `Use these when a criterion asks whether a session is active or price is inside the strategy's trading window.`,
  ].join("\n");
}

export async function buildAiContext(supabase: SupabaseClient, user: User): Promise<string> {
  const [
    tradesRes,
    stratRes,
    entryRes,
    exitRes,
    tmrRes,
    notesRes,
    analysesRes,
    newsRes,
    settingsRes,
    dayRevRes,
    tradeRevRes,
    accountsRes,
  ] = await Promise.all([
    supabase
      .from("trades")
      .select("id, account_id, pnl, r_multiple, pair, direction, traded_on, size_lots, emotion, notes, strategy_id")
      .order("traded_on", { ascending: true }),
    supabase.from("strategies").select(
      "id, name, plan_type, is_active, max_trades_per_day, max_daily_loss, max_daily_profit, risk_per_trade_pct, trading_window, trading_window_2, strategy_date, pair"
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
    // Tables from migrations 0014-0016; error branches yield empty/null.
    supabase.from("user_settings").select("*").maybeSingle(),
    supabase
      .from("day_reviews")
      .select("day, plan_followed, note, routine_done")
      .order("day", { ascending: false })
      .limit(14),
    supabase
      .from("trade_reviews")
      .select(
        "trade_id, plan_followed, confluences, management, mistakes, entry_emotion, exit_emotion, reflection, strategy_name"
      )
      .limit(400),
    supabase
      .from("accounts")
      .select("id, name, firm, phase, size, currency, status, started_on, ended_on, max_trades_per_day, max_daily_loss, max_daily_profit, trading_window, trading_window_2")
      .order("started_on", { ascending: false }),
  ]);

  // account_id ships code-first (migration 0019): selecting a missing column
  // fails the whole query, so retry without it rather than losing Sidekick.
  let tradesData = tradesRes.data as TradeRow[] | null;
  if (tradesRes.error) {
    const retry = await supabase
      .from("trades")
      .select("id, pnl, r_multiple, pair, direction, traded_on, size_lots, emotion, notes, strategy_id")
      .order("traded_on", { ascending: true });
    tradesData = retry.data as TradeRow[] | null;
  }
  const trades = tradesData ?? [];
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

  // Account-level guardrails from Settings (migration 0016). When set, breach
  // days are judged against these; otherwise fall back to strategy limits.
  const gs = (settingsRes.error ? null : (settingsRes.data as SettingsRow | null)) ?? null;
  const settingsLimits =
    gs && (gs.max_trades_per_day != null || gs.max_daily_loss)
      ? {
          name: "Settings",
          max_trades_per_day: gs.max_trades_per_day,
          max_daily_loss: gs.max_daily_loss,
        }
      : null;

  // Risk-rule breach days, judged against the account guardrails, or the
  // active strategy's limits as a fallback.
  const limits =
    settingsLimits ??
    strategies.find((s) => s.is_active && (s.max_trades_per_day != null || s.max_daily_loss != null)) ??
    strategies.find((s) => s.max_trades_per_day != null || s.max_daily_loss != null);
  const breachLines: string[] = [];
  if (limits) {
    const lossCap = resolveAmount(limits.max_daily_loss, accountSize);
    for (const [date, v] of Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (limits.max_trades_per_day != null && v.count > limits.max_trades_per_day) {
        breachLines.push(`${date}: ${v.count} trades (cap ${limits.max_trades_per_day})`);
      }
      if (lossCap != null && v.net < -Math.abs(lossCap)) {
        breachLines.push(`${date}: net ${n1(v.net)} ${cur} (daily loss cap ${n1(Math.abs(lossCap))} ${cur})`);
      }
    }
  }

  // Display a limit as entered, adding the resolved figure when it's a percent.
  const fmtLimit = (v: string | null) => {
    if (!v) return null;
    const s = v.trim();
    if (s.endsWith("%")) {
      const abs = resolveAmount(s, accountSize);
      return abs != null ? `${s} (${n1(Math.abs(abs))} ${cur})` : s;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? s : `${n1(Math.abs(n))} ${cur}`;
  };

  const stratBlocks = strategies.map((s) => {
    const rc: string[] = [];
    if (s.max_trades_per_day != null) rc.push(`max trades/day ${s.max_trades_per_day}`);
    if (fmtLimit(s.max_daily_loss)) rc.push(`max daily loss ${fmtLimit(s.max_daily_loss)}`);
    if (fmtLimit(s.max_daily_profit)) rc.push(`max daily profit ${fmtLimit(s.max_daily_profit)}`);
    if (fmtLimit(s.risk_per_trade_pct)) rc.push(`risk per trade ${fmtLimit(s.risk_per_trade_pct)}`);
    if (s.trading_window) rc.push(`trading window ${s.trading_window}`);
    if (s.trading_window_2) rc.push(`second window ${s.trading_window_2}`);
    return [
      `### Strategy: ${s.name}${s.plan_type ? ` (${s.plan_type})` : ""}${s.pair ? ` [pair: ${s.pair}]` : ""}${s.is_active ? " [active]" : ""}${s.strategy_date ? ` [date: ${s.strategy_date}]` : ""} [id: ${s.id}]`,
      `Risk controls: ${rc.length ? rc.join(", ") : "(none set)"}`,
      `Entry criteria:\n${lines(entryRes.data as LineRow[], s.id)}`,
      `Exit criteria:\n${lines(exitRes.data as LineRow[], s.id)}`,
      `Trade management rules:\n${lines(tmrRes.data as LineRow[], s.id)}`,
    ].join("\n");
  });

  // Trade reviews (journal entries per trade, migration 0014).
  const reviewRows = (tradeRevRes.error ? [] : ((tradeRevRes.data as ReviewRow[]) ?? []));
  const reviewByTrade = new Map(reviewRows.map((r) => [r.trade_id, r]));

  // Which mistakes and confluences recur, across all journaled trades.
  const tally = (pick: (r: ReviewRow) => string[] | null) => {
    const m = new Map<string, number>();
    reviewRows.forEach((r) => (pick(r) ?? []).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t, c]) => `${t} (${c})`);
  };
  const mistakeTally = tally((r) => r.mistakes);
  const confluenceTally = tally((r) => r.confluences);

  const stratName = new Map(strategies.map((s) => [s.id, s.name]));
  const recent = [...trades]
    .slice(-50)
    .reverse()
    .map((t) => {
      const rev = reviewByTrade.get(t.id);
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
        rev?.plan_followed != null ? `plan followed: ${rev.plan_followed ? "yes" : "no"}` : null,
        rev?.entry_emotion || rev?.exit_emotion
          ? `emotions ${rev.entry_emotion ?? "?"} -> ${rev.exit_emotion ?? "?"}`
          : null,
        rev?.confluences?.length ? `confluences: ${rev.confluences.join(", ")}` : null,
        rev?.mistakes?.length ? `mistakes: ${rev.mistakes.join(", ")}` : null,
        rev?.reflection ? `reflection: ${rev.reflection.slice(0, 120)}` : null,
      ].filter(Boolean);
      return `- ${bits.join(" | ")}`;
    });

  // Day reviews: plan-followed verdicts, routine completion, day notes.
  const dayRevLines = (dayRevRes.error ? [] : ((dayRevRes.data as DayReviewRow[]) ?? [])).map((d) => {
    const bits = [
      d.day,
      d.plan_followed ? `plan followed: ${d.plan_followed}` : null,
      d.routine_done?.length ? `routine done: ${d.routine_done.length} items` : null,
      d.note ? `note: ${d.note.slice(0, 160)}` : null,
    ].filter(Boolean);
    return `- ${bits.join(" | ")}`;
  });

  // Prop-firm accounts (migration 0019): the ledger plus per-account nets.
  type AccountRow = {
    id: string; name: string; firm: string | null; phase: string | null;
    size: number | null; currency: string | null; status: string;
    started_on: string; ended_on: string | null;
    max_trades_per_day: number | null; max_daily_loss: string | null;
    max_daily_profit: string | null; trading_window: string | null; trading_window_2: string | null;
  };
  const accountRows = (accountsRes.error ? [] : ((accountsRes.data as AccountRow[]) ?? []));
  const accountLines = accountRows.map((a) => {
    const acctTrades = trades.filter((t) => t.account_id === a.id && t.pnl != null);
    const acctNet = acctTrades.reduce((s, t) => s + (t.pnl as number), 0);
    const rails = [
      a.max_trades_per_day != null ? `max trades/day ${a.max_trades_per_day}` : null,
      a.max_daily_loss ? `max daily loss ${a.max_daily_loss}` : null,
      a.max_daily_profit ? `profit target ${a.max_daily_profit}` : null,
      a.trading_window ? `window ${a.trading_window}` : null,
      a.trading_window_2 ? `window 2 ${a.trading_window_2}` : null,
    ].filter(Boolean);
    return [
      `- ${a.name}${a.firm ? ` (${a.firm})` : ""}${a.phase ? ` [${a.phase}]` : ""} - ${a.status}`,
      a.size != null ? `size ${n1(a.size)} ${a.currency ?? cur}` : null,
      `${a.started_on}${a.ended_on ? ` to ${a.ended_on}` : ""}`,
      acctTrades.length ? `${acctTrades.length} trades, net ${n1(acctNet)} ${a.currency ?? cur}` : "no trades yet",
      rails.length ? `guardrails: ${rails.join(", ")}` : "guardrails: defaults",
    ]
      .filter(Boolean)
      .join(" | ");
  });

  // Account guardrails block.
  const guardrailLines: string[] = [];
  if (gs) {
    if (gs.max_trades_per_day != null) guardrailLines.push(`Max trades/day: ${gs.max_trades_per_day}`);
    if (fmtLimit(gs.max_daily_loss)) guardrailLines.push(`Max daily loss: ${fmtLimit(gs.max_daily_loss)}`);
    if (fmtLimit(gs.max_daily_profit)) guardrailLines.push(`Daily profit target: ${fmtLimit(gs.max_daily_profit)}`);
    if (gs.trading_window) guardrailLines.push(`Trading window: ${gs.trading_window}`);
    if (gs.trading_window_2) guardrailLines.push(`Second window: ${gs.trading_window_2}`);
    if (Array.isArray(gs.routine_items) && gs.routine_items.length) {
      guardrailLines.push(`Pre-market routine: ${(gs.routine_items as string[]).join("; ")}`);
    }
  }

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
    `## Right now`,
    nowContext(),
    ``,
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
    `## Trading accounts (prop-firm ledger; guardrails are per account, Settings holds the defaults)`,
    accountLines.length ? accountLines.join("\n") : "(no accounts created yet)",
    ``,
    `## Default guardrails (from Settings; used when a trade has no account)`,
    guardrailLines.length ? guardrailLines.join("\n") : "(none set)",
    ``,
    `## Recurring journal tags (across all trade reviews)`,
    mistakeTally.length || confluenceTally.length
      ? [
          mistakeTally.length ? `Mistakes: ${mistakeTally.join(", ")}` : null,
          confluenceTally.length ? `Confluences: ${confluenceTally.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "(no trades journaled with tags yet)",
    ``,
    `## Day reviews (latest ${dayRevLines.length}: plan-followed verdict, routine, day notes)`,
    dayRevLines.length ? dayRevLines.join("\n") : "(none)",
    ``,
    `## Most recent trades (up to 50, newest first; journaled trades include their review)`,
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
