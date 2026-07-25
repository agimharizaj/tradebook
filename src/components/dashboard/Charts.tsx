"use client";

import { useState } from "react";
import { moneySigned, sym } from "@/lib/format";

// Short date for chart axes: "21 Jul" (with year only if not this year).
function axisDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === new Date().getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "2-digit" };
  return d.toLocaleDateString(undefined, opts);
}

export function EquityCurve({
  values,
  baseline,
  dates,
  cur,
}: {
  values: number[];
  baseline: number;
  dates: string[];
  cur: string;
}) {
  const W = 900, H = 180, pad = 10;
  const [hover, setHover] = useState<number | null>(null);

  const all = [baseline, ...values];
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const up = values[values.length - 1] >= baseline;
  const color = up ? "var(--success)" : "var(--danger)";
  const mid = dates.length > 2 ? dates[Math.floor(dates.length / 2)] : null;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.min(values.length - 1, Math.max(0, Math.round(frac * (values.length - 1))));
    setHover(i);
  }

  return (
    <div>
      <div
        className="relative"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
          <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} stroke="var(--border2)" strokeDasharray="4 4" />
          <path d={area} fill={color} opacity="0.12" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {hover != null && (
            <>
              <line
                x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad}
                stroke="var(--border2)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(hover)} cy={y(values[hover])} r="4" fill={color} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `min(max(${(x(hover) / W) * 100}%, 3.5rem), calc(100% - 3.5rem))`,
            }}
          >
            <span className="text-dim">{axisDate(dates[hover] ?? "")}</span>{" "}
            <span className="font-mono font-medium">
              {sym(cur)}{values[hover].toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
      {dates.length >= 2 && (
        <div className="mt-1 flex justify-between font-mono text-[11px] text-dim">
          <span>{axisDate(dates[0])}</span>
          {mid && <span className="hidden sm:inline">{axisDate(mid)}</span>}
          <span>{axisDate(dates[dates.length - 1])}</span>
        </div>
      )}
    </div>
  );
}

export function DailyBars({ days, cur }: { days: [string, number][]; cur: string }) {
  const W = 440, H = 150, pad = 10;
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...days.map((d) => Math.abs(d[1])), 1);
  const mid = H / 2;
  const bw = (W - 2 * pad) / days.length;
  const midDay = days.length > 2 ? days[Math.floor(days.length / 2)][0] : null;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.min(days.length - 1, Math.max(0, Math.floor((vx - pad) / bw)));
    setHover(i);
  }

  return (
    <div>
      <div
        className="relative"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 150 }}>
          <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--border2)" />
          {days.map(([d, net], i) => {
            const h = (Math.abs(net) / max) * (H / 2 - pad);
            const isUp = net >= 0;
            return (
              <rect
                key={d}
                x={pad + i * bw + bw * 0.15}
                width={Math.max(1, bw * 0.7)}
                y={isUp ? mid - h : mid}
                height={Math.max(1, h)}
                fill={isUp ? "var(--success)" : "var(--danger)"}
                opacity={hover == null || hover === i ? 1 : 0.45}
                rx="1"
              />
            );
          })}
        </svg>
        {hover != null && days[hover] && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `min(max(${((pad + hover * bw + bw / 2) / W) * 100}%, 3.5rem), calc(100% - 3.5rem))`,
            }}
          >
            <span className="text-dim">{axisDate(days[hover][0])}</span>{" "}
            <span
              className={`font-mono font-medium ${days[hover][1] >= 0 ? "text-success" : "text-danger"}`}
            >
              {moneySigned(days[hover][1], cur)}
            </span>
          </div>
        )}
      </div>
      {days.length >= 2 && (
        <div className="mt-1 flex justify-between font-mono text-[11px] text-dim">
          <span>{axisDate(days[0][0])}</span>
          {midDay && <span className="hidden sm:inline">{axisDate(midDay)}</span>}
          <span>{axisDate(days[days.length - 1][0])}</span>
        </div>
      )}
    </div>
  );
}
