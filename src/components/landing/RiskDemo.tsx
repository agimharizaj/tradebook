"use client";

import { useState } from "react";
import { sizeFromRisk } from "@/lib/risk";

// A real, working slice of the risk engine. Same math the app runs
// (src/lib/risk.ts), with fixed snapshot prices instead of the live feed.
// All demo pairs are USD-quoted so a USD account needs no conversion.
const PAIRS: Record<string, { entry: string; stop: string }> = {
  "EUR/USD": { entry: "1.0842", stop: "1.0792" },
  "GBP/USD": { entry: "1.2650", stop: "1.2610" },
  "XAU/USD": { entry: "2320.0", stop: "2308.0" },
  "BTC/USD": { entry: "64200", stop: "63100" },
};

const inputCls =
  "w-full rounded-lg bg-surface2 px-3 py-2.5 font-mono text-sm text-foreground ring-1 ring-border outline-none transition focus:ring-accent";

export default function RiskDemo() {
  const [account, setAccount] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [pair, setPair] = useState("EUR/USD");
  const [entry, setEntry] = useState(PAIRS["EUR/USD"].entry);
  const [stop, setStop] = useState(PAIRS["EUR/USD"].stop);

  function switchPair(p: string) {
    setPair(p);
    setEntry(PAIRS[p].entry);
    setStop(PAIRS[p].stop);
  }

  const result = sizeFromRisk({
    accountSize: parseFloat(account),
    riskPct: parseFloat(riskPct),
    entry: parseFloat(entry),
    stop: parseFloat(stop),
    pair,
    conversion: 1,
  });

  const tooSmall = result !== null && result.lots === 0 && result.lotsExact > 0;

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-3 shadow-2xl">
      <div className="rounded-xl bg-card p-5 ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Position size</span>
          <span className="font-mono text-xs text-dim">demo prices</span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Pair">
          {Object.keys(PAIRS).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPair(p)}
              aria-pressed={p === pair}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                p === pair
                  ? "bg-accent text-white"
                  : "bg-surface2 text-muted ring-1 ring-border hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Account (USD)</span>
            <input className={inputCls} inputMode="decimal" value={account} onChange={(e) => setAccount(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Risk %</span>
            <input className={inputCls} inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Entry</span>
            <input className={inputCls} inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Stop loss</span>
            <input className={inputCls} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
        </div>

        <div className="mt-4 rounded-xl bg-surface2 p-4 ring-1 ring-border" aria-live="polite">
          {result === null ? (
            <p className="text-sm text-muted">Enter an account size, risk and two different prices.</p>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs text-dim">Size</div>
                <div className="font-mono text-2xl font-medium text-accent2">
                  {result.lots.toFixed(2)} <span className="text-sm text-muted">lots</span>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-muted">
                <div>
                  {result.direction === "long" ? "Long" : "Short"} · {result.stopPips.toFixed(1)} pips to stop
                </div>
                <div>
                  risking{" "}
                  {result.riskAmount.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          )}
          {tooSmall && (
            <p className="mt-2 text-xs text-danger">
              Stop too wide for the 0.01 lot minimum at this risk. Exact size: {result.lotsExact.toFixed(4)} lots.
            </p>
          )}
        </div>
      </div>
      <p className="px-2 pt-3 pb-1 font-mono text-xs text-dim">
        Same math as the app. In Tradebook the prices are live and there are three sizing modes.
      </p>
    </div>
  );
}
