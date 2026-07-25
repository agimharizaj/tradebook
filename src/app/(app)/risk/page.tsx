"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PAIRS = [
  "EUR/USD", "GBP/USD", "AUD/USD", "NZD/USD",
  "USD/JPY", "USD/CHF", "USD/CAD",
  "EUR/JPY", "GBP/JPY", "AUD/JPY",
  "EUR/GBP", "XAU/USD", "BTC/USD",
];
const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
  "SGD", "HKD", "SEK", "NOK", "DKK", "PLN", "ZAR", "AED",
];
const CONTRACT_SIZE = 100_000;
const GOLD_CONTRACT = 100;

function pipSizeFor(pair: string) {
  if (pair.startsWith("BTC")) return 1; // size BTC by price distance directly
  if (pair.startsWith("XAU")) return 0.1;
  return pair.includes("JPY") ? 0.01 : 0.0001;
}
function contractFor(pair: string) {
  if (pair.startsWith("BTC")) return 1;
  if (pair.startsWith("XAU")) return GOLD_CONTRACT;
  return CONTRACT_SIZE;
}
const baseCurrency = (pair: string) => pair.split("/")[0];
const quoteCurrency = (pair: string) => pair.split("/")[1];

type Mode = "size" | "stop" | "risk";
const MODES: { id: Mode; label: string }[] = [
  { id: "size", label: "Risk → lot size" },
  { id: "stop", label: "Lot size → stop" },
  { id: "risk", label: "Lot size + stop → risk" },
];

export default function RiskPage() {
  const [mode, setMode] = useState<Mode>("size");

  const [pair, setPair] = useState("EUR/USD");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [accountSize, setAccountSize] = useState("10000");
  const [conversion, setConversion] = useState("1");

  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [lots, setLots] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);

  const base = baseCurrency(pair);
  const quote = quoteCurrency(pair);
  const conversionNeeded = quote !== accountCurrency;
  const priceDecimals = pair.includes("JPY")
    ? 3
    : pair.startsWith("XAU") || pair.startsWith("BTC")
      ? 2
      : 5;

  const refreshMarket = useCallback(
    async (prefillEntry: boolean) => {
      setFxLoading(true);
      setFxError(null);
      try {
        const pr = await fetch(`/api/fx?from=${base}&to=${quote}`).then((r) => r.json());
        if (typeof pr.rate === "number") {
          setLivePrice(pr.rate);
          if (prefillEntry) setEntry(pr.rate.toFixed(priceDecimals));
        } else {
          setLivePrice(null);
        }

        if (quote !== accountCurrency) {
          const cr = await fetch(`/api/fx?from=${quote}&to=${accountCurrency}`).then((r) => r.json());
          if (typeof cr.rate === "number") {
            setConversion(String(cr.rate));
            setRateDate(cr.date ?? null);
          } else {
            setFxError("Conversion rate unavailable, enter it manually.");
          }
        } else {
          setConversion("1");
          setRateDate(null);
        }
      } catch {
        setFxError("Live data unavailable, enter values manually.");
      }
      setFxLoading(false);
    },
    [base, quote, accountCurrency, priceDecimals]
  );

  // Pair change: clear the previous trade levels and prefill entry with the new price.
  useEffect(() => {
    setStop("");
    setLots("");
    refreshMarket(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

  // Account currency change: just refresh the conversion rate, keep levels.
  useEffect(() => {
    refreshMarket(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCurrency]);

  // Prefill account currency and default risk from the user's saved profile.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const m = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (typeof m.account_currency === "string" && m.account_currency) {
        setAccountCurrency(m.account_currency);
      }
      if (typeof m.account_size === "string" && m.account_size) {
        setAccountSize(m.account_size);
      }
      if (typeof m.default_risk_pct === "string" && m.default_risk_pct) {
        setRiskPct(m.default_risk_pct);
      }
    });
  }, []);

  const result = useMemo(() => {
    const size = parseFloat(accountSize);
    const conv = parseFloat(conversion);
    const contract = contractFor(pair);
    const pip = pipSizeFor(pair);
    const pipValueAccount = pip * contract * conv;
    if (Number.isNaN(size) || size <= 0 || Number.isNaN(conv)) return null;

    if (mode === "size") {
      const risk = parseFloat(riskPct);
      const e = parseFloat(entry);
      const s = parseFloat(stop);
      if ([risk, e, s].some(Number.isNaN) || risk <= 0 || e === s) return null;
      const riskAmount = size * (risk / 100);
      const stopPips = Math.abs(e - s) / pip;
      const lotsOut = riskAmount / (stopPips * pipValueAccount);
      return {
        rows: [
          ["Direction", e > s ? "Long" : "Short"],
          ["Risk amount", `${riskAmount.toFixed(0)} ${accountCurrency}`],
          ["Stop distance", `${stopPips.toFixed(1)} pips`],
        ] as [string, string][],
        big: ["Lot size", lotsOut.toFixed(2)] as [string, string],
        extra: [["Units", (lotsOut * contract).toLocaleString(undefined, { maximumFractionDigits: 0 })]] as [string, string][],
      };
    }

    if (mode === "stop") {
      const risk = parseFloat(riskPct);
      const l = parseFloat(lots);
      const e = parseFloat(entry);
      if ([risk, l, e].some(Number.isNaN) || risk <= 0 || l <= 0) return null;
      const riskAmount = size * (risk / 100);
      const stopPips = riskAmount / (l * pipValueAccount);
      const stopPrice = direction === "long" ? e - stopPips * pip : e + stopPips * pip;
      return {
        rows: [
          ["Direction", direction === "long" ? "Long" : "Short"],
          ["Risk amount", `${riskAmount.toFixed(0)} ${accountCurrency}`],
          ["Stop distance", `${stopPips.toFixed(1)} pips`],
        ] as [string, string][],
        big: ["Stop-loss price", stopPrice.toFixed(priceDecimals)] as [string, string],
        extra: [] as [string, string][],
      };
    }

    const l = parseFloat(lots);
    const e = parseFloat(entry);
    const s = parseFloat(stop);
    if ([l, e, s].some(Number.isNaN) || l <= 0 || e === s) return null;
    const stopPips = Math.abs(e - s) / pip;
    const riskAmount = l * stopPips * pipValueAccount;
    const riskPctOut = (riskAmount / size) * 100;
    return {
      rows: [
        ["Direction", e > s ? "Long" : "Short"],
        ["Stop distance", `${stopPips.toFixed(1)} pips`],
        ["Risk %", `${riskPctOut.toFixed(2)}%`],
      ] as [string, string][],
      big: ["Risk amount", `${riskAmount.toFixed(0)} ${accountCurrency}`] as [string, string],
      extra: [] as [string, string][],
    };
  }, [mode, pair, accountCurrency, accountSize, conversion, riskPct, entry, stop, lots, direction, priceDecimals]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">Risk &amp; position size</h1>
          <p className="mt-1 text-muted">
            Enter your account risk and trade levels to size the position correctly.
          </p>
        </div>
        <button
          onClick={() => refreshMarket(true)}
          className="shrink-0 rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
        >
          {fxLoading ? "Refreshing..." : "Refresh prices"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-border2 bg-card p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              mode === m.id
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border">
          <Field label="Pair">
            <select value={pair} onChange={(e) => setPair(e.target.value)} className="input">
              {PAIRS.map((p) => (<option key={p}>{p}</option>))}
            </select>
            {livePrice != null ? (
              <span className="mt-1 flex items-center gap-2 text-xs text-dim">
                Live ~{livePrice.toFixed(priceDecimals)}
                <button
                  onClick={() => setEntry(livePrice.toFixed(priceDecimals))}
                  className="text-accent2 hover:underline"
                >
                  use as entry
                </button>
              </span>
            ) : (
              <span className="mt-1 block text-xs text-dim">
                Live price unavailable, enter manually.
              </span>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account currency">
              <input
                list="ccy-list"
                value={accountCurrency}
                onChange={(e) => setAccountCurrency(e.target.value.toUpperCase())}
                className="input"
              />
              <datalist id="ccy-list">
                {CURRENCIES.map((c) => (<option key={c} value={c} />))}
              </datalist>
            </Field>
            <Field label="Account size">
              <input type="number" inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(e.target.value)} className="input" />
            </Field>
          </div>

          {(mode === "size" || mode === "stop") && (
            <Field label="Risk % per trade">
              <input type="number" inputMode="decimal" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="input" />
            </Field>
          )}

          {(mode === "stop" || mode === "risk") && (
            <Field label="Lot size (standard lots)">
              <input type="number" inputMode="decimal" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} className="input" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry price">
              <input type="number" inputMode="decimal" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} className="input" />
            </Field>
            {mode === "stop" ? (
              <Field label="Direction">
                <select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")} className="input">
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </Field>
            ) : (
              <Field label="Stop loss price">
                <input type="number" inputMode="decimal" step="any" value={stop} onChange={(e) => setStop(e.target.value)} className="input" />
              </Field>
            )}
          </div>

          {conversionNeeded && (
            <Field
              label={`Rate: 1 ${quote} = ${accountCurrency}`}
              hint={
                fxError
                  ? fxError
                  : rateDate
                    ? `Auto-fetched (ECB reference, ${rateDate}). Editable.`
                    : "Auto-fetched. Editable."
              }
            >
              <input type="number" inputMode="decimal" step="any" value={conversion} onChange={(e) => setConversion(e.target.value)} className="input" />
            </Field>
          )}
          {!conversionNeeded && (
            <p className="text-xs text-dim">Quote currency matches your account, so no conversion needed.</p>
          )}
        </div>

        <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <h2 className="font-medium">Result</h2>
          {result ? (
            <div className="mt-4 space-y-3">
              {result.rows.map(([k, v]) => (<Row key={k} label={k} value={v} />))}
              <div className="my-4 h-px bg-border" />
              <Row label={result.big[0]} value={result.big[1]} big />
              {result.extra.map(([k, v]) => (<Row key={k} label={k} value={v} />))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Fill in the fields above to calculate.</p>
          )}
        </div>
      </div>

      <style>{`
        .input{width:100%;border-radius:.5rem;border:1px solid var(--border2);background:var(--surface2);color:var(--foreground);padding:.6rem .75rem;font-size:.9rem;font-family:var(--font-mono);outline:none;transition:border-color .15s,box-shadow .15s}
        .input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={big ? "font-mono text-3xl font-bold text-accent2" : "font-mono text-sm font-medium"}>
        {value}
      </span>
    </div>
  );
}
