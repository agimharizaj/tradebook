import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tfSeconds, type Candle, type Timeframe } from "@/lib/backtest";

export const dynamic = "force-dynamic";

// Historical OHLC candles for the backtest replay.
//   GET /api/candles?pair=EUR/USD&tf=1h&from=2026-01-05T00:00:00Z&to=2026-03-01T00:00:00Z
// Sources: Binance (crypto, keyless) and Twelve Data (FX + metals, free key in
// TWELVE_DATA_API_KEY, 800 req/day). Results are cached in public.candles
// (migration 0021) so repeat replays cost zero quota. Cache read/write both
// degrade gracefully when the migration is missing.

const TF_IDS: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"];
const TD_INTERVAL: Record<Timeframe, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1day", "1w": "1week",
};
const BINANCE_INTERVAL: Record<Timeframe, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1d", "1w": "1w",
};

// Cryptos in the pair catalog, mapped to Binance USDT symbols.
const BINANCE_SYMBOL: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", XRP: "XRPUSDT", SOL: "SOLUSDT",
  DOGE: "DOGEUSDT", ADA: "ADAUSDT", LTC: "LTCUSDT",
};

const MAX_BARS = 5000; // Twelve Data's per-request max
// Response cap. Longer windows are covered by paging the provider (each page
// is one Twelve Data request out of the free 800/day, then it's cached), so a
// replay started months back still runs right up to today.
// 50k bars is ~1.7 years of 15m FX, or 6 months of 5m. It's 10 Twelve Data
// pages; the free tier allows 8 requests/minute, so going much past this
// starts getting rate-limited mid-fetch rather than returning more data.
const MAX_TOTAL_BARS = 50000;
const MAX_PAGES = 12;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair")?.toUpperCase();
  const tf = searchParams.get("tf") as Timeframe | null;
  const fromISO = searchParams.get("from");
  const toISO = searchParams.get("to");

  if (!pair || !tf || !TF_IDS.includes(tf) || !fromISO) {
    return NextResponse.json({ error: "pair, tf and from are required" }, { status: 400 });
  }
  const from = Math.floor(Date.parse(fromISO) / 1000);
  const to = toISO ? Math.floor(Date.parse(toISO) / 1000) : Math.floor(Date.now() / 1000);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
    return NextResponse.json({ error: "invalid from/to" }, { status: 400 });
  }

  const step = tfSeconds(tf);
  // Only cap absurd windows (MAX_TOTAL_BARS worth of calendar time). Anything
  // shorter is fetched in full, paging the provider as needed.
  const cappedTo = Math.min(to, from + MAX_TOTAL_BARS * step);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  // 1) Cache. Serve it when it covers the requested window: the first cached
  // bar sits near `from` and the last near `cappedTo`. Tolerance is generous
  // (3 days + 3 bars) because FX markets close over weekends and holidays.
  const tol = 3 * 86400 + 3 * step;
  let cacheOk = false;
  try {
    const { data: cached, error } = await supabase
      .from("candles")
      .select("ts,o,h,l,c")
      .eq("symbol", pair)
      .eq("timeframe", tf)
      .gte("ts", new Date(from * 1000).toISOString())
      .lte("ts", new Date(cappedTo * 1000).toISOString())
      .order("ts", { ascending: true })
      .limit(MAX_TOTAL_BARS);
    if (!error && cached && cached.length > 10) {
      const first = Math.floor(Date.parse(cached[0].ts) / 1000);
      const last = Math.floor(Date.parse(cached[cached.length - 1].ts) / 1000);
      if (first <= from + tol && last >= cappedTo - tol) {
        const candles: Candle[] = cached.map((r) => ({
          t: Math.floor(Date.parse(r.ts) / 1000),
          o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c),
        }));
        return NextResponse.json({ candles, source: "cache" });
      }
      cacheOk = true; // table exists, just not enough coverage
    } else if (!error) {
      cacheOk = true;
    }
  } catch {
    // Cache table missing (migration 0021 not applied): fetch-only mode.
  }

  // 2) Provider.
  const base = pair.split("/")[0];
  let candles: Candle[];
  try {
    if (BINANCE_SYMBOL[base]) {
      try {
        candles = await fetchBinance(BINANCE_SYMBOL[base], tf, from, cappedTo);
      } catch (e) {
        // Geo-block or outage: Twelve Data also carries the majors' crypto.
        const key = process.env.TWELVE_DATA_API_KEY;
        if (!key) throw e;
        candles = await fetchTwelveData(pair, tf, from, cappedTo, key);
      }
    } else {
      const key = process.env.TWELVE_DATA_API_KEY;
      if (!key) {
        return NextResponse.json(
          {
            error: "missing_key",
            message:
              "FX and metals history needs a free Twelve Data API key. Add TWELVE_DATA_API_KEY to .env.local (and Vercel) - sign up at twelvedata.com.",
          },
          { status: 501 }
        );
      }
      candles = await fetchTwelveData(pair, tf, from, cappedTo, key);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "provider error";
    const status = msg === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: msg }, { status });
  }

  if (!candles.length) {
    return NextResponse.json({ error: "no data for that range" }, { status: 404 });
  }

  // 3) Write-through cache, insert-only in chunks; duplicates are ignored.
  if (cacheOk) {
    for (let i = 0; i < candles.length; i += 1000) {
      const rows = candles.slice(i, i + 1000).map((c) => ({
        symbol: pair,
        timeframe: tf,
        ts: new Date(c.t * 1000).toISOString(),
        o: c.o, h: c.h, l: c.l, c: c.c,
      }));
      const { error } = await supabase
        .from("candles")
        .upsert(rows, { onConflict: "symbol,timeframe,ts", ignoreDuplicates: true });
      if (error) break; // caching is best-effort, never fail the request
    }
  }

  return NextResponse.json({
    candles,
    source: BINANCE_SYMBOL[base] ? "binance" : "twelvedata",
  });
}

// Binance klines: keyless, 1000 bars per page, paged forward until `to`.
async function fetchBinance(
  symbol: string,
  tf: Timeframe,
  from: number,
  to: number
): Promise<Candle[]> {
  const out: Candle[] = [];
  let start = from * 1000;
  for (let page = 0; page < 30 && start < to * 1000 && out.length < MAX_TOTAL_BARS; page++) {
    // data-api.binance.vision is Binance's public market-data host: same
    // klines, no key, and NOT geo-blocked (api.binance.com returns 451 in
    // the UK and other restricted regions).
    const url =
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}` +
      `&interval=${BINANCE_INTERVAL[tf]}&startTime=${start}&endTime=${to * 1000}&limit=1000`;
    const r = await fetch(url);
    if (r.status === 429) throw new Error("rate_limited");
    if (!r.ok) throw new Error(`Binance error ${r.status}`);
    const rows: unknown[][] = await r.json();
    if (!rows.length) break;
    for (const k of rows) {
      out.push({
        t: Math.floor(Number(k[0]) / 1000),
        o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]),
      });
    }
    const lastOpen = Number(rows[rows.length - 1][0]);
    if (rows.length < 1000) break;
    start = lastOpen + 1;
  }
  return out.slice(0, MAX_TOTAL_BARS);
}

// Twelve Data time_series: one request covers up to 5000 bars, so walk the
// window forward a page at a time until it reaches `to`. Without this a long
// replay silently stopped ~5000 bars after its start date instead of running
// up to today.
async function fetchTwelveData(
  pair: string,
  tf: Timeframe,
  from: number,
  to: number,
  key: string
): Promise<Candle[]> {
  const step = tfSeconds(tf);
  const out: Candle[] = [];
  let cursor = from;
  for (let page = 0; page < MAX_PAGES && cursor < to && out.length < MAX_TOTAL_BARS; page++) {
    const pageTo = Math.min(to, cursor + MAX_BARS * step);
    let rows: Candle[];
    try {
      rows = await fetchTwelveDataPage(pair, tf, cursor, pageTo, key);
    } catch (e) {
      // Hit the 8-requests/minute ceiling part way through a long window:
      // return the bars we did get rather than failing the whole replay.
      if (out.length && e instanceof Error && e.message === "rate_limited") break;
      throw e;
    }
    if (!rows.length) {
      // Market closed for the whole slice (weekend/holiday): skip past it.
      cursor = pageTo + step;
      continue;
    }
    const last = rows[rows.length - 1].t;
    for (const c of rows) if (!out.length || c.t > out[out.length - 1].t) out.push(c);
    cursor = Math.max(last + step, cursor + step);
  }
  return out.slice(0, MAX_TOTAL_BARS);
}

async function fetchTwelveDataPage(
  pair: string,
  tf: Timeframe,
  from: number,
  to: number,
  key: string
): Promise<Candle[]> {
  const fmt = (s: number) => new Date(s * 1000).toISOString().slice(0, 19).replace("T", " ");
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}` +
    `&interval=${TD_INTERVAL[tf]}&start_date=${encodeURIComponent(fmt(from))}` +
    `&end_date=${encodeURIComponent(fmt(to))}&outputsize=5000&timezone=UTC&apikey=${key}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j?.status === "error") {
    if (j.code === 429) throw new Error("rate_limited");
    throw new Error(typeof j.message === "string" ? j.message : "Twelve Data error");
  }
  const values: { datetime: string; open: string; high: string; low: string; close: string }[] =
    j?.values ?? [];
  return values
    .map((v) => ({
      t: Math.floor(Date.parse(v.datetime.includes("T") ? v.datetime + "Z" : v.datetime.replace(" ", "T") + "Z") / 1000),
      o: Number(v.open), h: Number(v.high), l: Number(v.low), c: Number(v.close),
    }))
    .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.o))
    .sort((a, b) => a.t - b.t);
}
