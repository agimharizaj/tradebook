// Pure position-sizing math. No React, no fetches: everything here is
// deterministic and unit-testable. The UI in app/(app)/risk/page.tsx is a
// thin layer over these functions.

export const CONTRACT_SIZE = 100_000;
export const GOLD_CONTRACT = 100; // troy oz per lot
export const SILVER_CONTRACT = 5_000; // troy oz per lot (standard XAG lot)

// Cryptos are sized by price distance directly: pip 1, contract 1, so "lots"
// simply means coins. Works for any price level (BTC at 100k or XRP at 3).
const CRYPTO = ["BTC", "ETH", "XRP", "SOL", "DOGE", "ADA", "LTC"];
export const isCrypto = (pair: string) => CRYPTO.some((c) => pair.startsWith(c));

export function pipSizeFor(pair: string) {
  if (isCrypto(pair)) return 1;
  if (pair.startsWith("XAU")) return 0.1;
  if (pair.startsWith("XAG")) return 0.01;
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

export function contractFor(pair: string) {
  if (isCrypto(pair)) return 1;
  if (pair.startsWith("XAU")) return GOLD_CONTRACT;
  if (pair.startsWith("XAG")) return SILVER_CONTRACT;
  return CONTRACT_SIZE;
}

export const baseCurrency = (pair: string) => pair.split("/")[0];
export const quoteCurrency = (pair: string) => pair.split("/")[1];

// Brokers accept lots in 0.01 steps. Floor rather than round so the position
// never risks more than the stated amount.
export function floorToLotStep(lots: number, step = 0.01) {
  return Math.floor(lots / step + 1e-9) * step;
}

// Pip value of one lot, expressed in the account currency.
// conversion = 1 quote currency in account currency.
export function pipValuePerLot(pair: string, conversion: number) {
  return pipSizeFor(pair) * contractFor(pair) * conversion;
}

export type SizeInput = {
  accountSize: number;
  riskPct: number;
  entry: number;
  stop: number;
  pair: string;
  conversion: number;
};

export function sizeFromRisk(i: SizeInput) {
  const { accountSize, riskPct, entry, stop, pair, conversion } = i;
  if (
    [accountSize, riskPct, entry, stop, conversion].some(Number.isNaN) ||
    accountSize <= 0 || riskPct <= 0 || entry === stop
  ) {
    return null;
  }
  const pip = pipSizeFor(pair);
  const pipValue = pipValuePerLot(pair, conversion);
  const riskAmount = accountSize * (riskPct / 100);
  const stopPips = Math.abs(entry - stop) / pip;
  const lots = floorToLotStep(riskAmount / (stopPips * pipValue));
  return {
    direction: entry > stop ? ("long" as const) : ("short" as const),
    riskAmount,
    stopPips,
    lots,
    units: lots * contractFor(pair),
  };
}

export type StopInput = {
  accountSize: number;
  riskPct: number;
  lots: number;
  entry: number;
  direction: "long" | "short";
  pair: string;
  conversion: number;
};

export function stopFromLots(i: StopInput) {
  const { accountSize, riskPct, lots, entry, direction, pair, conversion } = i;
  if (
    [accountSize, riskPct, lots, entry, conversion].some(Number.isNaN) ||
    accountSize <= 0 || riskPct <= 0 || lots <= 0
  ) {
    return null;
  }
  const pip = pipSizeFor(pair);
  const pipValue = pipValuePerLot(pair, conversion);
  const riskAmount = accountSize * (riskPct / 100);
  const stopPips = riskAmount / (lots * pipValue);
  const stopPrice = direction === "long" ? entry - stopPips * pip : entry + stopPips * pip;
  return { riskAmount, stopPips, stopPrice };
}

export type RiskInput = {
  accountSize: number;
  lots: number;
  entry: number;
  stop: number;
  pair: string;
  conversion: number;
};

export function riskFromLots(i: RiskInput) {
  const { accountSize, lots, entry, stop, pair, conversion } = i;
  if (
    [accountSize, lots, entry, stop, conversion].some(Number.isNaN) ||
    accountSize <= 0 || lots <= 0 || entry === stop
  ) {
    return null;
  }
  const pip = pipSizeFor(pair);
  const pipValue = pipValuePerLot(pair, conversion);
  const stopPips = Math.abs(entry - stop) / pip;
  const riskAmount = lots * stopPips * pipValue;
  return {
    direction: entry > stop ? ("long" as const) : ("short" as const),
    stopPips,
    riskAmount,
    riskPct: (riskAmount / accountSize) * 100,
  };
}
