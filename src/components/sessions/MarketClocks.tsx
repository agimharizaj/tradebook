"use client";

import { useEffect, useMemo, useState } from "react";

// Market session clocks + a cross-market time converter. Pure client-side:
// all times come from Intl with explicit IANA zones, so DST is handled by
// the browser and nothing here needs a server or a library.

type Market = {
  name: string;
  tz: string;
  // Indicative session hours in the market's LOCAL time, minutes from 00:00.
  open: number;
  close: number;
  note: string;
};

const MARKETS: Market[] = [
  { name: "Sydney", tz: "Australia/Sydney", open: 7 * 60, close: 16 * 60, note: "AUD, NZD" },
  { name: "Tokyo", tz: "Asia/Tokyo", open: 9 * 60, close: 18 * 60, note: "JPY, Asia FX" },
  { name: "London", tz: "Europe/London", open: 8 * 60, close: 16 * 60 + 30, note: "GBP, EUR, XAU" },
  { name: "New York", tz: "America/New_York", open: 8 * 60, close: 17 * 60, note: "USD, CAD, indices" },
];

const WDS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zoneParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return {
    y: +get("year"),
    mo: +get("month"),
    d: +get("day"),
    h: +get("hour") % 24, // some engines emit "24" for midnight
    mi: +get("minute"),
    s: +get("second"),
    wd: WDS.indexOf(get("weekday")),
  };
}

// UTC instant for a wall-clock time in a zone (iterative correction handles
// DST offsets without a timezone library).
function wallToUtc(tz: string, y: number, mo: number, d: number, h: number, mi: number): Date {
  let utc = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = zoneParts(new Date(utc), tz);
    const diff = Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    if (!diff) break;
    utc += diff;
  }
  return new Date(utc);
}

// Session state at a given zone-local weekday + minutes.
function sessionStatus(m: Market, wd: number, mins: number): { open: boolean; minsTo: number } {
  const weekday = wd >= 1 && wd <= 5;
  if (weekday && mins >= m.open && mins < m.close) return { open: true, minsTo: m.close - mins };
  if (weekday && mins < m.open) return { open: false, minsTo: m.open - mins };
  // After close (or weekend): walk forward to the next weekday open.
  let add = 0;
  let d = wd;
  do {
    add += 1;
    d = (d + 1) % 7;
  } while (d === 0 || d === 6);
  return { open: false, minsTo: add * 1440 - mins + m.open };
}

function fmtDelta(mins: number): string {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const mi = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mi}m`;
  return `${mi}m`;
}

const two = (n: number) => n.toString().padStart(2, "0");
const fmtMins = (mins: number) => `${two(Math.floor(mins / 60))}:${two(mins % 60)}`;

export default function MarketClocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Converter: a wall-clock time entered in one market, shown in all of them.
  const [convTime, setConvTime] = useState("08:00");
  const [convFrom, setConvFrom] = useState("Europe/London");

  // The device's own zone as an extra source, unless it already matches a
  // market (a London user just uses London).
  const localTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const localIsMarket = MARKETS.some((m) => m.tz === localTz);

  // Fill the input with the current wall-clock time in the selected source.
  function setToNow() {
    const p = zoneParts(new Date(), convFrom);
    setConvTime(`${two(p.h)}:${two(p.mi)}`);
  }

  // Switch the source to the device's own zone and fill in local time now.
  function setToLocalNow() {
    const p = zoneParts(new Date(), localTz);
    setConvFrom(localTz);
    setConvTime(`${two(p.h)}:${two(p.mi)}`);
  }

  const converted = useMemo(() => {
    if (!now) return null;
    const m = convTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const src = zoneParts(now, convFrom);
    const instant = wallToUtc(convFrom, src.y, src.mo, src.d, +m[1], +m[2]);
    return MARKETS.map((mk) => {
      const p = zoneParts(instant, mk.tz);
      const st = sessionStatus(mk, p.wd, p.h * 60 + p.mi);
      return {
        market: mk,
        time: `${two(p.h)}:${two(p.mi)}`,
        wd: WDS[p.wd] ?? "",
        dayShift: p.d === src.d ? "" : p.d > src.d || (src.d > 25 && p.d < 3) ? "+1d" : "-1d",
        openThen: st.open,
      };
    });
  }, [now, convTime, convFrom]);

  if (!now) {
    return <p className="text-sm text-dim">Loading clocks…</p>;
  }

  const states = MARKETS.map((m) => {
    const p = zoneParts(now, m.tz);
    return { m, p, st: sessionStatus(m, p.wd, p.h * 60 + p.mi) };
  });
  const openNow = states.filter((s) => s.st.open).map((s) => s.m.name);
  const overlap =
    openNow.includes("London") && openNow.includes("New York")
      ? "London and New York overlap: the deepest liquidity of the day."
      : openNow.includes("Sydney") && openNow.includes("Tokyo")
        ? "Asia session: Sydney and Tokyo are both open."
        : openNow.includes("Tokyo") && openNow.includes("London")
          ? "Tokyo and London overlap."
          : null;

  return (
    <div className="space-y-6">
      {/* Now: who is open */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Open now</span>
          {openNow.length ? (
            <span className="font-mono text-sm text-success">{openNow.join(" · ")}</span>
          ) : (
            <span className="font-mono text-sm text-dim">No major session open</span>
          )}
        </div>
        {overlap && <p className="mt-1.5 text-sm text-muted">{overlap}</p>}
      </div>

      {/* Clocks */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {states.map(({ m, p, st }) => (
          <div key={m.name} className="rounded-2xl bg-card p-5 ring-1 ring-border">
            <div className="flex items-center justify-between">
              <span className="font-medium" style={{ fontFamily: "var(--font-display)" }}>
                {m.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  st.open ? "bg-success/15 text-success" : "bg-surface2 text-dim"
                }`}
              >
                {st.open ? "Open" : "Closed"}
              </span>
            </div>
            <div className="mt-3 font-mono text-3xl tabular-nums">
              {two(p.h)}:{two(p.mi)}
              <span className="text-lg text-dim">:{two(p.s)}</span>
            </div>
            <div className="mt-1 font-mono text-xs text-dim">
              {WDS[p.wd]} {two(p.d)}/{two(p.mo)}
            </div>
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-dim">Session</span>
                <span className="font-mono text-muted">
                  {fmtMins(m.open)}–{fmtMins(m.close)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">{st.open ? "Closes in" : "Opens in"}</span>
                <span className={`font-mono ${st.open ? "text-success" : "text-muted"}`}>{fmtDelta(st.minsTo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dim">Drives</span>
                <span className="text-muted">{m.note}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Converter */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Convert a time</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={convTime}
            onChange={(e) => setConvTime(e.target.value)}
            className="field !w-auto"
            aria-label="Time to convert"
          />
          <span className="text-xs text-dim">in</span>
          <select
            value={convFrom}
            onChange={(e) => setConvFrom(e.target.value)}
            className="field !w-auto"
            aria-label="Source market"
          >
            {MARKETS.map((m) => (
              <option key={m.tz} value={m.tz}>
                {m.name}
              </option>
            ))}
            {!localIsMarket && (
              <option value={localTz}>Local ({localTz.split("/").pop()?.replace(/_/g, " ")})</option>
            )}
          </select>
          <button
            onClick={setToNow}
            className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground"
            title="Set to the current time in the selected market"
          >
            Now
          </button>
          <button
            onClick={setToLocalNow}
            className="rounded-lg border border-border2 px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground"
            title="Switch the source to your device's timezone and fill in your local time now"
          >
            My local time
          </button>
        </div>
        {converted && (
          <div className="mt-4 divide-y divide-border">
            {converted.map((r) => (
              <div key={r.market.name} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${r.openThen ? "bg-success" : "bg-surface2 ring-1 ring-border2"}`}
                    aria-hidden="true"
                  />
                  <span className={r.market.tz === convFrom ? "text-foreground" : "text-muted"}>{r.market.name}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {r.time}
                  {r.dayShift && <span className="ml-1.5 text-xs text-dim">{r.dayShift}</span>}
                  <span className={`ml-2 text-xs ${r.openThen ? "text-success" : "text-dim"}`}>
                    {r.openThen ? "session open" : "closed"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-dim">
          Session hours are indicative local exchange/session times; FX itself trades around the clock Monday to
          Friday. DST is handled automatically.
        </p>
      </div>
    </div>
  );
}
