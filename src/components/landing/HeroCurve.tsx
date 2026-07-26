"use client";

import { useRef, useState } from "react";

// Demo balance series for the hero card. Clearly a demo: the numbers are
// round and the caption says so. Starts at 10,000 and ends +12.4% to match
// the stat chip next to it.
const BALANCES = [
  10000, 10110, 9930, 10260, 10180, 10420, 10350, 10610, 10490, 10760,
  10680, 10940, 10870, 11120, 11050, 11240,
];

const W = 400;
const H = 130;
const PAD = 6;

const min = Math.min(...BALANCES);
const max = Math.max(...BALANCES);
const x = (i: number) => PAD + (i / (BALANCES.length - 1)) * (W - PAD * 2);
const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);

const linePath = BALANCES.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
const areaPath = `${linePath} L${x(BALANCES.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

export default function HeroCurve() {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (BALANCES.length - 1));
    setHover(Math.max(0, Math.min(BALANCES.length - 1, i)));
  }

  const hv = hover === null ? null : BALANCES[hover];
  const pct = hv === null ? null : ((hv - BALANCES[0]) / BALANCES[0]) * 100;

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label="Demo balance curve rising 12.4 percent"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={PAD} x2={W - PAD} y1={y(BALANCES[0])} y2={y(BALANCES[0])} stroke="var(--border2)" strokeDasharray="4 4" />
        <path d={areaPath} fill="var(--success)" className="tb-fade" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--success)"
          strokeWidth="2.5"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          className="tb-draw"
        />
        {hover !== null && hv !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="var(--border2)" />
            <circle cx={x(hover)} cy={y(hv)} r="3.5" fill="var(--success)" />
          </g>
        )}
      </svg>
      <div className="mt-2 flex h-5 items-center justify-between font-mono text-xs">
        <span className="text-dim">{hover === null ? "Hover the curve" : `Trade day ${hover + 1}`}</span>
        {hv !== null && pct !== null && (
          <span className="text-foreground">
            {hv.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{" "}
            <span className={pct >= 0 ? "text-success" : "text-danger"}>
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
