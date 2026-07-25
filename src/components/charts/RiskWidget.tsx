"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sizeFromRisk, stopFromLots, riskFromLots, quoteCurrency } from "@/lib/risk";
import { moneySigned } from "@/lib/format";

type Mode = "size" | "stop" | "risk";
const MODES: { id: Mode; label: string }[] = [
  { id: "size", label: "Risk › lot size" },
  { id: "stop", label: "Lot size › stop" },
  { id: "risk", label: "Lot size + stop › risk" },
];

export default function RiskWidget({
  pairLabel,
  onClose,
}: {
  pairLabel: string;
  onClose: () => void;
}) {
  const pair = pairLabel.split(" ")[0].toUpperCase();
  const supported = pair.includes("/");
  const base = supported ? pair.split("/")[0] : "";
  const quote = supported ? quoteCurrency(pair) : "";
  const priceDecimals = pair.includes("JPY") ? 3 : pair.startsWith("XAU") || pair.startsWith("BTC") ? 2 : 5;

  const [mode, setMode] = useState<Mode>("size");
  const [accountSize, setAccountSize] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [lots, setLots] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [cur, setCur] = useState("USD");
  const [conv, setConv] = useState(1);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata ?? {};
      if (typeof m.account_size === "string" && m.account_size) setAccountSize(m.account_size);
      if (typeof m.default_risk_pct === "string" && m.default_risk_pct) setRiskPct(m.default_risk_pct);
      if (typeof m.account_currency === "string" && m.account_currency) setCur(m.account_currency);
    });
  }, []);

  const refresh = useCallback(
    async (prefill: boolean) => {
      if (!supported) return;
      try {
        const pr = await fetch(`/api/fx?from=${base}&to=${quote}`).then((r) => r.json());
        if (typeof pr.rate === "number") {
          setLivePrice(pr.rate);
          if (prefill) setEntry(pr.rate.toFixed(priceDecimals));
        }
      } catch {}
      if (quote && quote !== cur) {
        try {
          const cr = await fetch(`/api/fx?from=${quote}&to=${cur}`).then((r) => r.json());
          if (typeof cr.rate === "number") setConv(cr.rate);
        } catch {}
      } else {
        setConv(1);
      }
    },
    [supported, base, quote, cur, priceDecimals]
  );

  // Pair change (and mount): clear all trade levels immediately - a stale
  // BTC stop against a gold price sizes absurdly - then prefill entry with
  // the new live price.
  useEffect(() => {
    setEntry("");
    setStop("");
    setLots("");
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

  // Account currency change: refresh the conversion only, keep levels.
  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const parent = el.offsetParent as HTMLElement | null;
      const pr = parent?.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = e.clientX - (pr?.left ?? 0) - offset.current.x;
      let y = e.clientY - (pr?.top ?? 0) - offset.current.y;
      x = Math.max(0, Math.min((pr?.width ?? w) - w, x));
      y = Math.max(0, Math.min((pr?.height ?? h) - h, y));
      setPos({ x, y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  function startDrag(e: React.PointerEvent) {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }

  const common = { accountSize: parseFloat(accountSize), pair, conversion: conv };
  let big: [string, string] | null = null;
  const rows: [string, string][] = [];
  if (supported) {
    if (mode === "size") {
      const r = sizeFromRisk({ ...common, riskPct: parseFloat(riskPct), entry: parseFloat(entry), stop: parseFloat(stop) });
      if (r) {
        big = ["Lot size", r.lots.toFixed(2)];
        rows.push([r.direction === "long" ? "Long" : "Short", `${r.stopPips.toFixed(1)} pips`], ["Risk", moneySigned(-r.riskAmount, cur)]);
      }
    } else if (mode === "stop") {
      const r = stopFromLots({ ...common, riskPct: parseFloat(riskPct), lots: parseFloat(lots), entry: parseFloat(entry), direction });
      if (r) {
        big = ["Stop-loss", r.stopPrice.toFixed(priceDecimals)];
        rows.push([direction === "long" ? "Long" : "Short", `${r.stopPips.toFixed(1)} pips`], ["Risk", moneySigned(-r.riskAmount, cur)]);
      }
    } else {
      const r = riskFromLots({ ...common, lots: parseFloat(lots), entry: parseFloat(entry), stop: parseFloat(stop) });
      if (r) {
        big = ["Risk", moneySigned(-r.riskAmount, cur)];
        rows.push([r.direction === "long" ? "Long" : "Short", `${r.stopPips.toFixed(1)} pips`], ["Risk %", `${r.riskPct.toFixed(2)}%`]);
      }
    }
  }

  return (
    <>
      <div
        ref={rootRef}
        style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 12 }}
        className="absolute z-20 w-72 rounded-xl border border-border2 bg-card/95 p-3 shadow-xl backdrop-blur max-md:!inset-x-2 max-md:!bottom-2 max-md:!top-auto max-md:w-auto"
      >
        <div onPointerDown={startDrag} className="mb-2 flex cursor-move select-none items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">⋮⋮ Risk · {pair}</span>
          <div className="flex items-center gap-1">
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => refresh(true)} className="rounded-md px-1.5 py-0.5 text-[10px] text-accent2 hover:underline" title="Refresh price">refresh</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="rounded-md p-1.5 text-dim hover:text-foreground" aria-label="Close">✕</button>
          </div>
        </div>

        {!supported ? (
          <p className="text-xs text-dim">Position sizing isn&apos;t available for this instrument yet.</p>
        ) : (
          <>
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="rfield mb-2 w-full">
              {MODES.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <Field label={`Account (${cur})`}><input inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} className="rfield" /></Field>
              {(mode === "size" || mode === "stop") && (
                <Field label="Risk %"><input inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="rfield" /></Field>
              )}
              {(mode === "stop" || mode === "risk") && (
                <Field label="Lots"><input inputMode="decimal" value={lots} onChange={(e) => setLots(e.target.value)} className="rfield" /></Field>
              )}
              <Field label="Entry"><input inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} className="rfield" /></Field>
              {mode === "stop" ? (
                <Field label="Direction">
                  <select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")} className="rfield">
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </Field>
              ) : (
                <Field label="Stop"><input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} className="rfield" /></Field>
              )}
              {quote !== cur && (
                <Field label={`1 ${quote} = ${cur}`}><input inputMode="decimal" value={String(conv)} onChange={(e) => setConv(parseFloat(e.target.value) || 0)} className="rfield" /></Field>
              )}
            </div>

            {livePrice != null && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-dim">
                Live ~{livePrice.toFixed(priceDecimals)}
                <button onClick={() => setEntry(livePrice.toFixed(priceDecimals))} className="text-accent2 hover:underline">use as entry</button>
              </div>
            )}

            <div className="mt-2 border-t border-border pt-2">
              {big ? (
                <>
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-muted">{big[0]}</span>
                    <span className="font-mono text-2xl font-bold text-accent2">{big[1]}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-dim">
                    {rows.map(([k, v]) => (<span key={k}>{k}: {v}</span>))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-dim">Fill the fields to size the trade.</p>
              )}
            </div>
          </>
        )}

        <style>{`
          .rfield{width:100%;border-radius:.4rem;border:1px solid var(--border2);background:var(--surface2);color:var(--foreground);padding:.35rem .5rem;font-size:.8rem;font-family:var(--font-mono);outline:none}
          .rfield:focus{border-color:var(--accent)}
          @media (max-width:767px){ .rfield{ font-size:1rem; padding:.5rem .6rem } }
        `}</style>
      </div>

      {dragging && <div className="fixed inset-0 z-[60] cursor-grabbing" />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] text-dim">{label}</span>
      {children}
    </label>
  );
}
