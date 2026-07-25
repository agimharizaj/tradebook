"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import TradingViewChart from "@/components/charts/TradingViewChart";
import AnalysisPanel from "@/components/charts/AnalysisPanel";
import RiskWidget from "@/components/charts/RiskWidget";
import { PAIR_CATALOG, tvSymbolFor } from "@/lib/pairs";
import { captureChartArea } from "@/lib/captureChart";
import { usePairs } from "@/lib/usePairs";

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
  // User watchlist (Profile -> Trading pairs) mapped to TradingView symbols.
  const watchlist = usePairs();
  const pairs = watchlist
    .map((label) => ({ label, tv: tvSymbolFor(label) }))
    .filter((p): p is { label: string; tv: string } => !!p.tv);
  const [tv, setTv] = useState("FX:EURUSD");

  // Deep link from TradingView widgets (news page ticker/heatmap):
  // /charts?tvwidgetsymbol=FX:EURUSD opens that symbol here.
  const deepLinked = useRef(false);
  useEffect(() => {
    const sym = new URLSearchParams(window.location.search).get("tvwidgetsymbol");
    if (!sym) return;
    const m = PAIR_CATALOG.find(
      (p) => p.tv.toUpperCase() === sym.toUpperCase() ||
        p.label.replace("/", "") === sym.split(":").pop()?.toUpperCase()
    );
    if (m) {
      deepLinked.current = true;
      setTv(m.tv);
    }
  }, []);

  // If the saved watchlist loads without the current symbol, jump to its
  // first - unless a deep link chose the symbol deliberately.
  useEffect(() => {
    if (deepLinked.current) return;
    if (pairs.length && !pairs.some((p) => p.tv === tv)) setTv(pairs[0].tv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);
  const [showLog, setShowLog] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [showInd, setShowInd] = useState(false);
  const [studies, setStudies] = useState<string[]>([]);
  const [tf, setTf] = useState("60");
  const current = pairs.find((p) => p.tv === tv)?.label ?? tv;
  const tfLabel = TIMEFRAMES.find((t) => t.tv === tf)?.label ?? "1H";

  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(({ data }) => {
      const saved = data.user?.user_metadata?.chart_studies;
      if (Array.isArray(saved)) setStudies(saved.filter((x) => typeof x === "string"));
    });
  }, []);

  // Replaces TradingView's hidden top-toolbar camera: capture the chart
  // (cropped when "This Tab" is picked) and download it as a PNG.
  const [snapping, setSnapping] = useState(false);
  async function snapshot() {
    setSnapping(true);
    const r = await captureChartArea();
    setSnapping(false);
    if (!r.ok) return; // cancelled or unsupported: nothing to download
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-${current.replace(/\W/g, "")}-${tfLabel}-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

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
          {pairs.map((p) => (
            <option key={p.tv} value={p.tv}>{p.label}</option>
          ))}
        </select>
        <Link
          href="/profile/pairs"
          className="shrink-0 whitespace-nowrap text-xs text-dim transition hover:text-accent2"
          title="Add or remove pairs"
        >
          Edit pairs
        </Link>
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border2 bg-card p-0.5"
          role="group"
          aria-label="Timeframe"
        >
          {TIMEFRAMES.map((t) => (
            <button
              key={t.tv}
              onClick={() => setTf(t.tv)}
              className={`rounded-md px-2 py-1.5 font-mono text-xs font-medium transition ${
                tf === t.tv ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
        <button
          onClick={snapshot}
          disabled={snapping}
          title="Download a chart screenshot"
          aria-label="Download a chart screenshot"
          className="shrink-0 rounded-lg border border-border2 px-3 py-2 text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
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
            // Search the full catalog so analyses for pairs no longer on the
            // watchlist still load on the chart.
            const m =
              PAIR_CATALOG.find((p) => p.label === symbol || p.tv === symbol) ??
              PAIR_CATALOG.find((p) => p.label.startsWith(symbol));
            if (m) setTv(m.tv);
          }}
        />
      )}
    </div>
  );
}
