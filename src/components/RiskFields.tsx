"use client";

// Shared risk-limit inputs, used by strategy risk controls and Settings
// guardrails so both edit the same "figure or % of account" and
// "HH:MM-HH:MM timezone" text formats with the same UI.
import { useEffect, useRef, useState } from "react";

// Field that accepts either a figure ("500") or a percent of account ("5%").
// The value is kept verbatim - percents are NOT converted to a figure - so a
// "5%" cap tracks the account size wherever it's later read. A live preview
// shows what the percent works out to right now.
export function MoneyOrPct({
  label,
  v,
  on,
  accountSize,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  accountSize: number;
}) {
  // Show the value's live relationship to the current account both ways: a
  // percent shows the figure it works out to now, a figure shows what percent
  // of the account it is. Either way the hint reflects the current account.
  const t = v.trim();
  const isPct = t.endsWith("%");
  const pct = isPct ? parseFloat(t.slice(0, -1)) : NaN;
  const figure = !isPct ? parseFloat(t) : NaN;
  let hint = accountSize > 0 ? "Type a figure or % of account" : " ";
  if (accountSize > 0) {
    if (isPct && !Number.isNaN(pct)) {
      const abs = Math.round((pct / 100) * accountSize * 100) / 100;
      hint = `= ${abs.toLocaleString()} of ${accountSize.toLocaleString()} now`;
    } else if (!isPct && !Number.isNaN(figure) && figure !== 0) {
      const p = Math.round((figure / accountSize) * 10000) / 100;
      hint = `= ${p}% of ${accountSize.toLocaleString()} now`;
    }
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      <input
        inputMode="decimal"
        value={v}
        onChange={(e) => on(e.target.value)}
        placeholder={accountSize > 0 ? "500 or 5%" : "500"}
        className="field"
        style={{ fontFamily: "var(--font-mono)" }}
      />
      <span className="mt-0.5 block text-[11px] text-dim">{hint}</span>
    </label>
  );
}

// Structured trading window: start/end time pickers plus a timezone select
// defaulting to the browser timezone. Stored as "08:00-17:00 Europe/London"
// in the existing text column, so no migration is needed.
export function WindowPicker({
  value,
  on,
  label = "Trading window",
}: {
  value: string;
  on: (v: string) => void;
  label?: string;
}) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  // Local state, synced from the prop only when it changes externally
  // (opening another strategy). Re-parsing our own emissions clobbered
  // half-typed times, because a partial time input reads as "".
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [tz, setTz] = useState(browserTz);
  const composed = useRef("");
  useEffect(() => {
    if (value === composed.current) return;
    const m = value.match(/^(\d{1,2}:\d{2})?\s*-\s*(\d{1,2}:\d{2})?\s*(\S.*)?$/);
    setStart(m?.[1] ?? "");
    setEnd(m?.[2] ?? "");
    setTz(m?.[3]?.trim() || browserTz);
    composed.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const TZS = Array.from(
    new Set([
      browserTz,
      "UTC",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "America/Chicago",
      "Asia/Tokyo",
      "Asia/Singapore",
      "Australia/Sydney",
    ])
  );
  const emit = (sv: string, ev: string, zv: string) => {
    setStart(sv);
    setEnd(ev);
    setTz(zv);
    const v = sv || ev ? `${sv}-${ev} ${zv}` : "";
    composed.current = v;
    on(v);
  };
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-dim">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="time"
          value={start}
          onChange={(e) => emit(e.target.value, end, tz)}
          className="field !w-auto !px-2 !py-1.5 !text-sm"
          aria-label="Window start"
        />
        <span className="text-xs text-dim">to</span>
        <input
          type="time"
          value={end}
          onChange={(e) => emit(start, e.target.value, tz)}
          className="field !w-auto !px-2 !py-1.5 !text-sm"
          aria-label="Window end"
        />
        <select
          value={tz}
          onChange={(e) => emit(start, end, e.target.value)}
          className="field !w-auto min-w-0 max-w-[9.5rem] !px-2 !py-1.5 !text-sm"
          aria-label="Timezone"
        >
          {/* Values stay IANA ids; labels drop the underscores (New_York). */}
          {TZS.map((z) => (<option key={z} value={z}>{z.replace(/_/g, " ")}</option>))}
          {!TZS.includes(tz) && <option value={tz}>{tz.replace(/_/g, " ")}</option>}
        </select>
      </div>
    </label>
  );
}
