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

  // Switch the source to the device's own zone and fill in local time now.
  function setToLocalNow() {
    const p = zoneParts(new Date(), localTz);
    setConvFrom(localTz);
    setConvTime(`${two(p.h)}:${two(p.mi)}`);
  }

  // Overlap-timeline scrubber: the cursor position as a 0-100 percentage of
  // the local day, or null when the pointer is away.
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  function onScrub(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setHoverPct(Math.min(Math.max(x, 0), 100));
  }

  // Overlap timeline: a 24h axis across the user's local day (midnight to
  // midnight). Each session is drawn where it is open in local time, and the
  // stretches where two or more sessions are open at once are shaded - those
  // are the deep-liquidity overlaps. Everything is computed from UTC instants
  // via IANA zones, so DST (and mismatched clock-change dates) is handled.
  const timeline = useMemo(() => {
    if (!now) return null;
    const dayMs = 86_400_000;
    const rp = zoneParts(now, localTz);
    const dayStart = wallToUtc(localTz, rp.y, rp.mo, rp.d, 0, 0).getTime();
    const dayEnd = dayStart + dayMs;

    // Raw open/close instants for each market across yesterday/today/tomorrow
    // (a session can spill over the local-midnight edges of the window).
    const raw = MARKETS.map((m) => {
      const iv: [number, number][] = [];
      for (const off of [-1, 0, 1]) {
        const p = zoneParts(new Date(now.getTime() + off * dayMs), m.tz);
        if (p.wd === 0 || p.wd === 6) continue; // FX shut over the weekend
        const o = wallToUtc(m.tz, p.y, p.mo, p.d, Math.floor(m.open / 60), m.open % 60).getTime();
        const c = wallToUtc(m.tz, p.y, p.mo, p.d, Math.floor(m.close / 60), m.close % 60).getTime();
        iv.push([o, c]);
      }
      return iv;
    });

    const pct = (t: number) => ((t - dayStart) / dayMs) * 100;
    const segsByMarket = raw.map((iv) => {
      const segs: { x0: number; x1: number }[] = [];
      for (const [o, c] of iv) {
        const s = Math.max(o, dayStart);
        const e = Math.min(c, dayEnd);
        if (e > s) segs.push({ x0: pct(s), x1: pct(e) });
      }
      return segs;
    });

    // Sample every 5 minutes; a band is a run where 2+ markets are open.
    const N = 288;
    const bands: { x0: number; x1: number }[] = [];
    let i = 0;
    while (i < N) {
      const open = (k: number) => {
        const t = dayStart + ((k + 0.5) / N) * dayMs;
        return raw.filter((iv) => iv.some(([o, c]) => t >= o && t < c)).length;
      };
      if (open(i) >= 2) {
        let j = i;
        while (j < N && open(j) >= 2) j++;
        bands.push({ x0: (i / N) * 100, x1: (j / N) * 100 });
        i = j;
      } else i++;
    }

    return {
      segsByMarket,
      bands,
      nowPct: pct(now.getTime()),
      hasAny: segsByMarket.some((s) => s.length > 0),
    };
  }, [now, localTz]);

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

      {/* Overlap timeline */}
      {timeline && (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Overlaps today</span>
            <span className="text-xs text-dim">Your local day · shaded = two or more sessions open</span>
          </div>

          {timeline.hasAny ? (
            <div className="mt-4">
              {/* Hour axis */}
              <div className="flex">
                <div className="w-16 shrink-0" />
                <div className="relative h-4 flex-1">
                  {[0, 6, 12, 18, 24].map((h) => (
                    <span
                      key={h}
                      className="absolute -translate-x-1/2 font-mono text-[10px] text-dim"
                      style={{ left: `${(h / 24) * 100}%` }}
                    >
                      {two(h)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Rows + shared overlay for bands and the now line */}
              <div className="relative">
                {MARKETS.map((m, idx) => {
                  const rowOpen =
                    hoverPct !== null &&
                    timeline.segsByMarket[idx].some((s) => hoverPct >= s.x0 && hoverPct < s.x1);
                  return (
                    <div key={m.name} className="flex items-center py-1.5">
                      <span className={`w-16 shrink-0 pr-2 text-xs transition-colors ${rowOpen ? "text-accent2" : "text-muted"}`}>{m.name}</span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface2/50">
                        {timeline.segsByMarket[idx].map((s, k) => {
                          const hit = hoverPct !== null && hoverPct >= s.x0 && hoverPct < s.x1;
                          return (
                            <div
                              key={k}
                              className={`absolute inset-y-0 rounded-md transition-opacity ${hit || hoverPct === null ? "bg-accent opacity-100" : "bg-accent opacity-55"}`}
                              style={{ left: `${s.x0}%`, width: `${Math.max(s.x1 - s.x0, 0.5)}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Overlay spans the track area only (left-16 clears labels) */}
                <div className="pointer-events-none absolute inset-y-0 left-16 right-0">
                  {timeline.bands.map((b, k) => (
                    <div
                      key={k}
                      className="absolute inset-y-0 border-x border-success/40 bg-success/15"
                      style={{ left: `${b.x0}%`, width: `${b.x1 - b.x0}%` }}
                    />
                  ))}
                  {timeline.nowPct >= 0 && timeline.nowPct <= 100 && (
                    <div
                      className="absolute inset-y-0 w-px bg-foreground/70"
                      style={{ left: `${timeline.nowPct}%` }}
                    >
                      <span className="absolute -top-0.5 -translate-x-1/2 rounded bg-foreground px-1 py-px text-[9px] font-medium text-background">
                        now
                      </span>
                    </div>
                  )}
                </div>

                {/* Interaction layer: scrub the day to read the exact time and
                    which sessions are open there. Sits above the bars. */}
                <div
                  className="absolute inset-y-0 left-16 right-0 z-10"
                  style={{ touchAction: "none" }}
                  onPointerMove={onScrub}
                  onPointerDown={onScrub}
                  onPointerLeave={() => setHoverPct(null)}
                >
                  {hoverPct !== null &&
                    (() => {
                      const hp = hoverPct;
                      if (hp === null) return null;
                      const mins = Math.round((hp / 100) * 1440) % 1440;
                      const timeStr = `${two(Math.floor(mins / 60))}:${two(mins % 60)}`;
                      const openMk = MARKETS.filter((_, idx) =>
                        timeline.segsByMarket[idx].some((s) => hp >= s.x0 && hp < s.x1)
                      );
                      return (
                        <>
                          <div
                            className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
                            style={{ left: `${hp}%` }}
                          />
                          <div
                            className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border2 bg-card px-2.5 py-1.5 shadow-xl"
                            style={{ left: `${Math.min(Math.max(hp, 14), 86)}%` }}
                          >
                            <div className="font-mono text-sm text-foreground">{timeStr}</div>
                            {openMk.length ? (
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                                <span className={openMk.length >= 2 ? "text-success" : "text-muted"}>
                                  {openMk.map((m) => m.name).join(" · ")}
                                </span>
                                {openMk.length >= 2 && (
                                  <span className="rounded bg-success/15 px-1 text-[10px] text-success">overlap</span>
                                )}
                              </div>
                            ) : (
                              <div className="mt-0.5 text-xs text-dim">No session open</div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm bg-accent" /> Session open
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm border border-success/40 bg-success/15" /> Overlap (deep liquidity)
                </span>
                <span className="text-dim">Hover or drag across to read any time</span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Markets are shut for the weekend - no sessions today.</p>
          )}
        </div>
      )}

      {/* Converter */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Convert a market time</div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <input
            type="time"
            value={convTime}
            onChange={(e) => setConvTime(e.target.value)}
            className="field !w-auto !px-2 !py-1.5 sm:!px-3 sm:!py-2"
            aria-label="Time to convert"
          />
          <span className="text-xs text-dim">in</span>
          <select
            value={convFrom}
            onChange={(e) => setConvFrom(e.target.value)}
            className="field !w-auto !px-2 !py-1.5 sm:!px-3 sm:!py-2"
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
            onClick={setToLocalNow}
            className="rounded-lg border border-border2 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground sm:px-3 sm:py-2 sm:text-sm"
            title="Switch the source to your device's timezone and fill in your local time now"
          >
            Local time
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
      </div>
    </div>
  );
}
