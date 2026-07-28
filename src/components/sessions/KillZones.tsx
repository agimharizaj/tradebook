"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Kill-zone performance: bucket the trader's own trades by which ICT kill zone
// their time falls in (all defined in New York time, so DST is handled by Intl),
// over a chosen date range. Answers "which windows do I actually make money in".

type Trade = { pnl: number | null; traded_on: string };

// ICT kill zones in America/New_York local time, as minutes from midnight.
const ZONES = [
  { key: "asia", name: "Asia", ny: "20:00-00:00", from: 20 * 60, to: 24 * 60 },
  { key: "london", name: "London", ny: "02:00-05:00", from: 2 * 60, to: 5 * 60 },
  { key: "nyam", name: "NY AM", ny: "09:30-11:00", from: 9 * 60 + 30, to: 11 * 60 },
  { key: "nylunch", name: "NY Lunch", ny: "12:00-13:00", from: 12 * 60, to: 13 * 60 },
  { key: "nypm", name: "NY PM", ny: "13:30-16:00", from: 13 * 60 + 30, to: 16 * 60 },
] as const;

const nyFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function nyMinutes(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = nyFmt.formatToParts(d);
  const h = +(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = +(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function zoneOf(mins: number): string {
  for (const z of ZONES) if (mins >= z.from && mins < z.to) return z.key;
  return "outside";
}

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};


const fmtMoney = (n: number) =>
  `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Bucket = { count: number; net: number; wins: number; withPnl: number };

export default function KillZones() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<"0" | "7" | "14" | "30" | "90" | "all" | "custom">("90");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await createClient()
        .from("trades")
        .select("pnl, traded_on")
        .order("traded_on", { ascending: false });
      if (error) setError(error.message);
      setTrades((data as Trade[]) ?? []);
    })();
  }, []);

  const range = useMemo(() => {
    if (preset === "custom") return { from: from || "0000-01-01", to: to || "9999-12-31" };
    if (preset === "all") return { from: "0000-01-01", to: "9999-12-31" };
    return { from: isoDaysAgo(Number(preset)), to: "9999-12-31" };
  }, [preset, from, to]);

  const agg = useMemo(() => {
    if (!trades) return null;
    const inRange = trades.filter((t) => {
      const d = t.traded_on.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
    const keys = [...ZONES.map((z) => z.key), "outside"];
    const buckets: Record<string, Bucket> = {};
    for (const k of keys) buckets[k] = { count: 0, net: 0, wins: 0, withPnl: 0 };
    for (const t of inRange) {
      const mins = nyMinutes(t.traded_on);
      if (mins == null) continue;
      const b = buckets[zoneOf(mins)];
      b.count += 1;
      if (t.pnl != null) {
        b.net += t.pnl;
        b.withPnl += 1;
        if (t.pnl > 0) b.wins += 1;
      }
    }
    const maxAbs = Math.max(1, ...keys.map((k) => Math.abs(buckets[k].net)));
    return { buckets, total: inRange.length, maxAbs };
  }, [trades, range]);

  const presetBtn = (id: typeof preset, label: string) => (
    <button
      onClick={() => setPreset(id)}
      className={`rounded-lg border px-2.5 py-1 text-xs transition ${
        preset === id
          ? "border-accent bg-accent-soft text-accent2"
          : "border-border2 text-muted hover:border-accent hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  const row = (name: string, ny: string, b: Bucket, muted = false) => {
    const winRate = b.withPnl ? Math.round((b.wins / b.withPnl) * 100) : null;
    const barPct = agg ? (Math.abs(b.net) / agg.maxAbs) * 100 : 0;
    const pos = b.net >= 0;
    return (
      <div key={name} className="flex items-center gap-2 py-2.5 sm:gap-3">
        <div className="w-20 shrink-0 sm:w-24">
          <div className={`truncate text-sm ${muted ? "text-dim" : "text-foreground"}`}>{name}</div>
          <div className="font-mono text-[10px] text-dim">{ny}</div>
        </div>
        {/* Diverging bar: net PnL magnitude, coloured by sign, from the centre.
            Hidden on mobile where the row is too narrow for it plus the numbers. */}
        <div className="relative hidden h-5 min-w-0 flex-1 sm:block">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border2" />
          {b.count > 0 && (
            <div
              className={`absolute inset-y-0.5 rounded-sm ${pos ? "bg-success/70" : "bg-danger/70"}`}
              style={
                pos
                  ? { left: "50%", width: `${barPct / 2}%` }
                  : { right: "50%", width: `${barPct / 2}%` }
              }
            />
          )}
        </div>
        <div className="w-11 shrink-0 text-right font-mono text-[11px] text-muted sm:w-14 sm:text-xs">
          {b.count > 0 ? `${b.count}` : "-"}
          <span className="text-dim"> tr</span>
        </div>
        <div className="w-9 shrink-0 text-right font-mono text-[11px] text-muted sm:w-12 sm:text-xs">
          {winRate == null ? "-" : `${winRate}%`}
        </div>
        <div
          className={`min-w-0 flex-1 text-right font-mono text-xs sm:w-20 sm:flex-none sm:text-sm ${
            b.count === 0 ? "text-dim" : pos ? "text-success" : "text-danger"
          }`}
        >
          {b.withPnl ? fmtMoney(b.net) : "-"}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Kill zones</span>
        <span className="text-xs text-dim">Your trades by ICT kill zone (New York time)</span>
      </div>

      {/* Date filter */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {presetBtn("0", "Today")}
        {presetBtn("7", "1 week")}
        {presetBtn("14", "2 weeks")}
        {presetBtn("30", "1 month")}
        {presetBtn("90", "3 months")}
        {presetBtn("all", "All")}
        <span className="mx-1 text-dim">|</span>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPreset("custom");
          }}
          className="field !w-auto !px-2 !py-1 !text-xs"
          aria-label="From date"
          title="From date"
        />
        <span className="text-xs text-dim">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPreset("custom");
          }}
          className="field !w-auto !px-2 !py-1 !text-xs"
          aria-label="To date"
          title="To date"
        />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-danger">Could not load trades: {error}</p>
      ) : !agg ? (
        <p className="mt-4 text-sm text-dim">Loading trades…</p>
      ) : agg.total === 0 ? (
        <p className="mt-4 text-sm text-muted">No trades in this range.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 border-b border-border pb-1.5 text-[10px] font-medium uppercase tracking-wide text-dim sm:gap-3">
            <span className="w-20 shrink-0 sm:w-24">Zone</span>
            <span className="hidden min-w-0 flex-1 text-center sm:block">Net PnL</span>
            <span className="w-11 shrink-0 text-right sm:w-14">Trades</span>
            <span className="w-9 shrink-0 text-right sm:w-12">Win</span>
            <span className="min-w-0 flex-1 text-right sm:w-20 sm:flex-none">PnL</span>
          </div>
          <div className="divide-y divide-border">
            {ZONES.map((z) => row(z.name, z.ny, agg.buckets[z.key]))}
            {row("Outside", "no zone", agg.buckets.outside, true)}
          </div>
          <p className="mt-3 text-[11.5px] text-dim">
            {agg.total} trade{agg.total === 1 ? "" : "s"} in range, bucketed by each trade&apos;s
            recorded time converted to New York. DST is handled automatically.
          </p>
        </>
      )}
    </div>
  );
}
