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
