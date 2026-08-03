"use client";

// Interactive guardrails demo for the landing page: drag the day's PnL and
// log fake trades to watch the limits react - the same logic the Charts
// trading-day panel runs against your real settings.
import { useState } from "react";

// Demo limits sized for a 100K account (3% daily loss cap, 5% target).
const MAX_TRADES = 5;
const MAX_LOSS = -3000;
const TARGET = 5000;

export default function GuardrailsDemo() {
  const [pnl, setPnl] = useState(-1200);
  const [count, setCount] = useState(3);

  const pos = (v: number) =>
    Math.min(100, Math.max(0, ((v - MAX_LOSS) / (TARGET - MAX_LOSS)) * 100));
  const zeroPct = pos(0);
  const nowPct = pos(pnl);
  const fill = { left: Math.min(zeroPct, nowPct), width: Math.abs(nowPct - zeroPct) };
  const lossHit = pnl <= MAX_LOSS;
  const targetHit = pnl >= TARGET;
  const tradesMaxed = count >= MAX_TRADES;

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-3 shadow-2xl">
      <div className="rounded-xl bg-card p-5 ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Trading day · demo
          </span>
          <span className="font-mono text-xs text-dim">guardrails live here</span>
        </div>

        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-muted">Trades today</span>
          <span className="flex items-center gap-2">
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: MAX_TRADES }, (_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full ${i < count ? "bg-danger" : "border border-border2"}`}
                />
              ))}
            </span>
            <span className="font-mono text-xs">{count}/{MAX_TRADES}</span>
          </span>
        </div>
        <div className="flex justify-end gap-1.5 pb-2">
          <button
            onClick={() => setCount((c) => Math.max(0, c - 1))}
            className="rounded-md border border-border2 px-2 py-1 font-mono text-xs text-muted transition hover:border-accent hover:text-foreground"
            aria-label="Remove a demo trade"
          >
            -1
          </button>
          <button
            onClick={() => setCount((c) => Math.min(MAX_TRADES, c + 1))}
            className="rounded-md border border-border2 px-2 py-1 font-mono text-xs text-muted transition hover:border-accent hover:text-foreground"
            aria-label="Log a demo trade"
          >
            +1 trade
          </button>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Today&apos;s net PnL</span>
            <span
              className={`font-mono text-sm font-semibold ${pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : ""}`}
            >
              {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toLocaleString()}
            </span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-surface2">
            <div
              className={`absolute inset-y-0 rounded-full transition-all ${pnl < 0 ? "bg-danger" : "bg-success"}`}
              style={{ left: `${fill.left}%`, width: `${fill.width}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-border2"
              style={{ left: `${zeroPct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="relative mt-1 flex justify-between font-mono text-[10px] text-dim">
            <span>-$3,000 max loss</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${zeroPct}%` }}>0</span>
            <span>+$5,000 target</span>
          </div>
          <input
            type="range"
            min={-4000}
            max={6000}
            step={100}
            value={pnl}
            onChange={(e) => setPnl(Number(e.target.value))}
            aria-label="Drag the demo day's PnL"
            className="mt-3 w-full accent-[color:var(--accent)]"
          />
        </div>

        <div className="mt-3 min-h-16 space-y-2" aria-live="polite">
          {lossHit && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              Max daily loss hit. Stop trading for today.
            </p>
          )}
          {tradesMaxed && !lossHit && (
            <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">
              Trade limit reached (5/5). The next one is overtrading.
            </p>
          )}
          {targetHit && (
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
              Daily target reached. Protect it.
            </p>
          )}
          {!lossHit && !tradesMaxed && !targetHit && (
            <p className="px-1 py-2 text-xs text-dim">
              Drag the slider or log trades to see the guardrails react.
            </p>
          )}
        </div>
      </div>
      <p className="px-2 pb-1 pt-3 font-mono text-xs text-dim">
        In the app these limits come from your Settings and watch your real trades.
      </p>
    </div>
  );
}
