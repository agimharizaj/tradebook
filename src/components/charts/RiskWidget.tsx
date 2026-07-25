"use client";

import { useEffect, useState } from "react";
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
    <div className="w-64 rounded-xl border border-border2 bg-card/95 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Risk · {pair}</span>
        <button onClick={onClose} className="text-dim hover:text-foreground" aria-label="Close">✕</button>
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
      `}</style>
    </div>
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
