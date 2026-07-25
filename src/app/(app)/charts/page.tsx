"use client";

import { useState } from "react";
import TradingViewChart from "@/components/charts/TradingViewChart";

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

export default function ChartsPage() {
  const [tv, setTv] = useState(PAIRS[0].tv);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg" style={{ fontFamily: "var(--font-display)" }}>Charts</h1>
        <select
          value={tv}
          onChange={(e) => setTv(e.target.value)}
          className="rounded-lg border border-border2 bg-surface2 px-3 py-1.5 text-sm outline-none focus:border-accent"
        >
          {PAIRS.map((p) => (
            <option key={p.tv} value={p.tv}>{p.label}</option>
          ))}
        </select>
        <span className="text-xs text-dim">
          Full drawing tools. Placing trades from here is coming later.
        </span>
      </div>
      <div className="flex-1">
        <TradingViewChart symbol={tv} />
      </div>
    </div>
  );
}
