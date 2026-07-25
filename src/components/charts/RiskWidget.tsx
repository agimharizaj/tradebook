"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sizeFromRisk, quoteCurrency } from "@/lib/risk";
import { moneySigned } from "@/lib/format";

export default function RiskWidget({
  pairLabel,
  onClose,
}: {
  pairLabel: string;
  onClose: () => void;
}) {
  const pair = pairLabel.split(" ")[0].toUpperCase();
  const supported = pair.includes("/");
  const quote = supported ? quoteCurrency(pair) : "";

  const [accountSize, setAccountSize] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [cur, setCur] = useState("USD");
  const [conv, setConv] = useState(1);

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

  useEffect(() => {
    if (!quote || quote === cur) {
      setConv(1);
      return;
    }
    fetch(`/api/fx?from=${quote}&to=${cur}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.rate === "number") setConv(d.rate);
      })
      .catch(() => {});
  }, [quote, cur]);

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

  const res = supported
    ? sizeFromRisk({
        accountSize: parseFloat(accountSize),
        riskPct: parseFloat(riskPct),
        entry: parseFloat(entry),
        stop: parseFloat(stop),
        pair,
        conversion: conv,
      })
    : null;

  return (
    <>
      <div
        ref={rootRef}
        style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 12 }}
        className="absolute z-20 w-64 rounded-xl border border-border2 bg-card/95 p-3 shadow-xl backdrop-blur max-md:!inset-x-2 max-md:!bottom-2 max-md:!top-auto max-md:w-auto"
      >
        <div
          onPointerDown={startDrag}
          className="mb-2 flex cursor-move select-none items-center justify-between"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted">⋮⋮ Risk · {pair}</span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="rounded-md p-1.5 text-dim hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!supported ? (
          <p className="text-xs text-dim">Position sizing isn&apos;t available for this instrument yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Account (${cur})`}><input inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} className="rfield" /></Field>
              <Field label="Risk %"><input inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="rfield" /></Field>
              <Field label="Entry"><input inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} className="rfield" /></Field>
              <Field label="Stop"><input inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} className="rfield" /></Field>
            </div>

            <div className="mt-3 border-t border-border pt-2">
              {res ? (
                <>
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-muted">Lot size</span>
                    <span className="font-mono text-2xl font-bold text-accent2">{res.lots.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-dim">
                    <span>{res.direction === "long" ? "Long" : "Short"} · {res.stopPips.toFixed(1)} pips</span>
                    <span>risk {moneySigned(res.riskAmount, cur)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-dim">Enter entry and stop to size the trade.</p>
              )}
            </div>
          </>
        )}

        <style>{`
          .rfield{width:100%;border-radius:.4rem;border:1px solid var(--border2);background:var(--surface2);color:var(--foreground);padding:.35rem .5rem;font-size:.8rem;font-family:var(--font-mono);outline:none}
          .rfield:focus{border-color:var(--accent)}
          /* 16px on phones so iOS doesn't zoom the page into the input */
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
