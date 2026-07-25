"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TradingViewChart from "@/components/charts/TradingViewChart";
import AnalysisPanel from "@/components/charts/AnalysisPanel";
import RiskWidget from "@/components/charts/RiskWidget";

const PAIRS: { label: string; tv: string }[] = [
  { label: "EUR/USD", tv: "FX:EURUSD" },
  { label: "GBP/USD", tv: "FX:GBPUSD" },
  { label: "AUD/USD", tv: "FX:AUDUSD" },
  { label: "USD/JPY", tv: "FX:USDJPY" },
  { label: "GBP/JPY", tv: "FX:GBPJPY" },
  { label: "USD/CAD", tv: "FX:USDCAD" },
  { label: "XAU/USD (Gold)", tv: "OANDA:XAUUSD" },
  { label: "BTC/USD", tv: "COINBASE:BTCUSD" },
  { label: "US30", tv: "OANDA:US30USD" },
  { label: "NAS100", tv: "OANDA:NAS100USD" },
];

const STUDIES: { id: string; label: string }[] = [
  { id: "RSI@tv-basicstudies", label: "RSI" },
  { id: "MACD@tv-basicstudies", label: "MACD" },
  { id: "MAExp@tv-basicstudies", label: "EMA" },
  { id: "MASimple@tv-basicstudies", label: "SMA" },
  { id: "BB@tv-basicstudies", label: "Bollinger" },
  { id: "IchimokuCloud@tv-basicstudies", label: "Ichimoku" },
  { id: "Stochastic@tv-basicstudies", label: "Stochastic" },
  { id: "Volume@tv-basicstudies", label: "Volume" },
  { id: "PivotPointsStandard@tv-basicstudies", label: "Pivots" },
  { id: "ATR@tv-basicstudies", label: "ATR" },
];

const TIMEFRAMES: { tv: string; label: string }[] = [
  { tv: "1", label: "1m" },
  { tv: "5", label: "5m" },
  { tv: "15", label: "15m" },
  { tv: "30", label: "30m" },
  { tv: "60", label: "1H" },
  { tv: "240", label: "4H" },
  { tv: "D", label: "1D" },
  { tv: "W", label: "1W" },
];

export default function ChartsPage() {
  const [tv, setTv] = useState(PAIRS[0].tv);
  const [showLog, setShowLog] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [showInd, setShowInd] = useState(false);
  const [studies, setStudies] = useState<string[]>([]);
  const [tf, setTf] = useState("60");
  const current = PAIRS.find((p) => p.tv === tv)?.label ?? tv;
  const tfLabel = TIMEFRAMES.find((t) => t.tv === tf)?.label ?? "1H";

  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(({ data }) => {
      const saved = data.user?.user_metadata?.chart_studies;
      if (Array.isArray(saved)) setStudies(saved.filter((x) => typeof x === "string"));
    });
  }, []);

  function toggle(id: string) {
    setStudies((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const s = createClient();
      s.auth.updateUser({ data: { chart_studies: next } });
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* One scrollable row on phones so the toolbar never stacks and eats chart height */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2.5 md:gap-3 md:py-3">
        <h1 className="shrink-0 text-lg" style={{ fontFamily: "var(--font-display)" }}>Charts</h1>
        <select
          value={tv}
          onChange={(e) => setTv(e.target.value)}
          className="shrink-0 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {PAIRS.map((p) => (
            <option key={p.tv} value={p.tv}>{p.label}</option>
          ))}
        </select>
        <select
          value={tf}
          onChange={(e) => setTf(e.target.value)}
          className="shrink-0 rounded-lg border border-border2 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Timeframe"
        >
          {TIMEFRAMES.map((t) => (
            <option key={t.tv} value={t.tv}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={() => setShowInd((s) => !s)}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition ${showInd ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted hover:border-accent hover:text-foreground"}`}
        >
          Indicators
        </button>
        <button
          onClick={() => setShowRisk((s) => !s)}
          className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition ${showRisk ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted hover:border-accent hover:text-foreground"}`}
        >
          Risk
        </button>
        <button
          onClick={() => setShowLog(true)}
          className="shrink-0 whitespace-nowrap rounded-lg border border-border2 px-3 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
        >
          Analysis log
        </button>
        <span className="hidden shrink-0 text-xs text-dim lg:inline">
          Drawing tools (fib, long/short, trendlines) are in the left toolbar.
        </span>
      </div>

      {showInd && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg2 px-4 py-2">
          <span className="mr-1 text-xs text-dim">Star indicators (auto-load and save):</span>
          {STUDIES.map((s) => {
            const on = studies.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-accent bg-accent-soft text-accent2" : "border-border2 text-muted hover:text-foreground"}`}
              >
                {on ? "★ " : "☆ "}{s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* id used by AnalysisPanel to crop self-tab screen captures to the chart */}
      <div id="tv-chart-area" className="relative flex-1">
        <TradingViewChart symbol={tv} studies={studies} interval={tf} />
        {showRisk && <RiskWidget pairLabel={current} onClose={() => setShowRisk(false)} />}
      </div>

      {showLog && (
        <AnalysisPanel
          defaultSymbol={current}
          defaultTimeframe={tfLabel}
          onClose={() => setShowLog(false)}
          onLoadSymbol={(symbol) => {
            const m = PAIRS.find(
              (p) => p.label === symbol || p.tv === symbol || p.label.startsWith(symbol)
            );
            if (m) setTv(m.tv);
          }}
        />
      )}
    </div>
  );
}
