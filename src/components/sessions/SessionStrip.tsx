"use client";

// Compact market-session chips for the trading-day panel: one chip per
// market with a live open/closed dot, reusing the same indicative hours and
// DST-safe zone math as the full MarketClocks section on /news#sessions.
import { useEffect, useState } from "react";
import { MARKETS, sessionStatus, zoneParts } from "@/components/sessions/MarketClocks";

export default function SessionStrip() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  if (!now) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {MARKETS.map((m) => {
        const p = zoneParts(now, m.tz);
        const st = sessionStatus(m, p.wd, p.h * 60 + p.mi);
        const two = (n: number) => n.toString().padStart(2, "0");
        return (
          <span
            key={m.name}
            className="inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2 py-1 font-mono text-[11px] text-muted"
            title={`${m.name} ${two(p.h)}:${two(p.mi)} local · ${st.open ? "session open" : "closed"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${st.open ? "bg-success" : "bg-danger/60"}`}
              aria-hidden="true"
            />
            {m.name} {two(p.h)}:{two(p.mi)}
          </span>
        );
      })}
    </div>
  );
}
