export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$",
  CHF: "CHF ", NZD: "NZ$", SGD: "S$", HKD: "HK$", SEK: "kr ",
  NOK: "kr ", DKK: "kr ", PLN: "zł ", ZAR: "R", AED: "AED ",
};

export function sym(code: string) {
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

// Signed, compact (no decimals) — for calendar cells and summaries.
export function moneySigned(n: number, code: string) {
  const s = sym(code);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${s}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Live thousands separators for numeric text inputs ("1000000" -> "1,000,000").
// Leaves anything non-numeric untouched so typing never gets blocked.
export function withCommas(v: string) {
  const t = v.replace(/,/g, "");
  if (t === "" || !/^\d*\.?\d*$/.test(t)) return v;
  const [i, d] = t.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${g}.${d}` : g;
}

// Parse an input that may contain separators. parseFloat("10,000") is 10,
// so every consumer of comma-formatted inputs must go through this.
export const numFromInput = (v: string) => parseFloat(v.replace(/,/g, ""));
