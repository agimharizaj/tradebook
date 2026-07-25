"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  baseCurrency,
  quoteCurrency,
  sizeFromRisk,
  stopFromLots,
  riskFromLots,
} from "@/lib/risk";

import Link from "next/link";
import { isSizable } from "@/lib/pairs";
import { numFromInput, withCommas } from "@/lib/format";
import { usePairs } from "@/lib/usePairs";
const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
  "SGD", "HKD", "SEK", "NOK", "DKK", "PLN", "ZAR", "AED",
];

type Mode = "size" | "stop" | "risk";
const MODES: { id: Mode; label: string }[] = [
  { id: "size", label: "Risk › lot size" },
  { id: "stop", label: "Lot size › stop" },
  { id: "risk", label: "Lot size + stop › risk" },
];

export default function RiskPage() {
  const [mode, setMode] = useState<Mode>("size");

  // Watchlist pairs that the risk engine can size (BASE/QUOTE instruments).
  const sizablePairs = usePairs().filter(isSizable);
  const [pair, setPair] = useState("EUR/USD");

  // If the saved watchlist loads without the current pair, switch to its first.
  useEffect(() => {
    if (sizablePairs.length && !sizablePairs.includes(pair)) setPair(sizablePairs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizablePairs.join("|")]);
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

  // Pair change: clear all previous trade levels immediately (a stale EUR/USD
  // stop against a BTC/USD price would size the trade wildly wrong), then
  // prefill entry with the new live price.
  useEffect(() => {
    setEntry("");
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
        setAccountSize(withCommas(m.account_size));
      }
      if (typeof m.default_risk_pct === "string" && m.default_risk_pct) {
        setRiskPct(m.default_risk_pct);
      }
    });
  }, []);

  const result = useMemo(() => {
    const size = numFromInput(accountSize);
    const conv = parseFloat(conversion);

    if (mode === "size") {
      const r = sizeFromRisk({
        accountSize: size,
        riskPct: parseFloat(riskPct),
        entry: parseFloat(entry),
        stop: parseFloat(stop),
        pair,
        conversion: conv,
      });
      if (!r) return null;
      if (r.lots <= 0) {
        return {
          rows: [
            ["Direction", r.direction === "long" ? "Long" : "Short"],
            ["Stop distance", `${r.stopPips.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pips`],
            ["Needed size", `${r.lotsExact.toFixed(3)} lots (min 0.01)`],
          ] as [string, string][],
          big: ["Lot size", "0.00"] as [string, string],
          extra: [["Fix", "tighten the stop or raise risk %"]] as [string, string][],
        };
      }
      return {
        rows: [
          ["Direction", r.direction === "long" ? "Long" : "Short"],
          ["Risk amount", `${Math.round(r.riskAmount).toLocaleString()} ${accountCurrency}`],
          ["Stop distance", `${r.stopPips.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pips`],
        ] as [string, string][],
        big: ["Lot size", r.lots.toFixed(2)] as [string, string],
        extra: [["Units", r.units.toLocaleString(undefined, { maximumFractionDigits: 0 })]] as [string, string][],
      };
    }

    if (mode === "stop") {
      const r = stopFromLots({
        accountSize: size,
        riskPct: parseFloat(riskPct),
        lots: parseFloat(lots),
        entry: parseFloat(entry),
        direction,
        pair,
        conversion: conv,
      });
      if (!r) return null;
      return {
        rows: [
          ["Direction", direction === "long" ? "Long" : "Short"],
          ["Risk amount", `${Math.round(r.riskAmount).toLocaleString()} ${accountCurrency}`],
          ["Stop distance", `${r.stopPips.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pips`],
        ] as [string, string][],
        big: ["Stop-loss price", r.stopPrice.toFixed(priceDecimals)] as [string, string],
        extra: [] as [string, string][],
      };
    }

    const r = riskFromLots({
      accountSize: size,
      lots: parseFloat(lots),
      entry: parseFloat(entry),
      stop: parseFloat(stop),
      pair,
      conversion: conv,
    });
    if (!r) return null;
    return {
      rows: [
        ["Direction", r.direction === "long" ? "Long" : "Short"],
        ["Stop distance", `${r.stopPips.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pips`],
        ["Risk %", `${r.riskPct.toFixed(2)}%`],
      ] as [string, string][],
      big: ["Risk amount", `${Math.round(r.riskAmount).toLocaleString()} ${accountCurrency}`] as [string, string],
      extra: [] as [string, string][],
    };
  }, [mode, pair, accountCurrency, accountSize, conversion, riskPct, entry, stop, lots, direction, priceDecimals]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl">Risk &amp; position size</h1>
          <p className="mt-1 text-muted">
            Enter your account risk and trade levels to size the position correctly.
          </p>
        </div>
        <div className="flex gap-2 self-start sm:shrink-0">
          <button
            onClick={() => { setEntry(""); setStop(""); setLots(""); }}
            className="rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            Clear figures
          </button>
          <button
            onClick={() => refreshMarket(true)}
            className="rounded-lg border border-border2 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-foreground"
          >
            {fxLoading ? "Refreshing..." : "Refresh prices"}
          </button>
        </div>
      </div>

      {/* Phones get a dropdown; wider screens keep the segmented pills. */}
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
        className="input mt-5 w-full sm:hidden"
        aria-label="Calculator mode"
      >
        {MODES.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
      </select>
      <div className="mt-5 hidden gap-1 rounded-xl border border-border2 bg-card p-1 sm:flex sm:flex-wrap">
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
              {sizablePairs.map((p) => (<option key={p}>{p}</option>))}
            </select>
            <span className="mt-1 block text-xs">
              <Link href="/profile/pairs" className="text-accent2 hover:underline">Edit pairs</Link>
            </span>
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
            {pair.startsWith("XAU") && (
              <span className="mt-1 block text-xs text-dim">
                Gold pip here = a $0.10 move. Some calculators count $0.01, so
                their pip figure is 10x; the lot size is identical either way.
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
              <input inputMode="decimal" value={accountSize} onChange={(e) => setAccountSize(withCommas(e.target.value))} className="input" />
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
      <span className={big ? "font-mono text-2xl font-bold text-accent2 md:text-3xl" : "font-mono text-sm font-medium"}>
        {value}
      </span>
    </div>
  );
}
