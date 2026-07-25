// Master instrument catalog. The user's active watchlist (a subset of these
// labels) lives in auth user_metadata.pairs and drives every pair dropdown in
// the app. Add new instruments here once and they become selectable in the
// Profile pairs manager.

export type PairInfo = {
  label: string; // canonical app-wide identifier, e.g. "EUR/USD"
  tv: string; // TradingView symbol for the Charts page
  cat: "FX majors" | "FX crosses" | "Metals" | "Crypto" | "Indices" | "Energy";
};

export const PAIR_CATALOG: PairInfo[] = [
  // FX majors
  { label: "EUR/USD", tv: "FX:EURUSD", cat: "FX majors" },
  { label: "GBP/USD", tv: "FX:GBPUSD", cat: "FX majors" },
  { label: "USD/JPY", tv: "FX:USDJPY", cat: "FX majors" },
  { label: "USD/CHF", tv: "FX:USDCHF", cat: "FX majors" },
  { label: "USD/CAD", tv: "FX:USDCAD", cat: "FX majors" },
  { label: "AUD/USD", tv: "FX:AUDUSD", cat: "FX majors" },
  { label: "NZD/USD", tv: "FX:NZDUSD", cat: "FX majors" },
  // FX crosses
  { label: "EUR/GBP", tv: "FX:EURGBP", cat: "FX crosses" },
  { label: "EUR/JPY", tv: "FX:EURJPY", cat: "FX crosses" },
  { label: "EUR/CHF", tv: "FX:EURCHF", cat: "FX crosses" },
  { label: "EUR/AUD", tv: "FX:EURAUD", cat: "FX crosses" },
  { label: "EUR/CAD", tv: "FX:EURCAD", cat: "FX crosses" },
  { label: "EUR/NZD", tv: "FX:EURNZD", cat: "FX crosses" },
  { label: "GBP/JPY", tv: "FX:GBPJPY", cat: "FX crosses" },
  { label: "GBP/CHF", tv: "FX:GBPCHF", cat: "FX crosses" },
  { label: "GBP/AUD", tv: "FX:GBPAUD", cat: "FX crosses" },
  { label: "GBP/CAD", tv: "FX:GBPCAD", cat: "FX crosses" },
  { label: "GBP/NZD", tv: "FX:GBPNZD", cat: "FX crosses" },
  { label: "AUD/JPY", tv: "FX:AUDJPY", cat: "FX crosses" },
  { label: "AUD/NZD", tv: "FX:AUDNZD", cat: "FX crosses" },
  { label: "AUD/CAD", tv: "FX:AUDCAD", cat: "FX crosses" },
  { label: "AUD/CHF", tv: "FX:AUDCHF", cat: "FX crosses" },
  { label: "NZD/JPY", tv: "FX:NZDJPY", cat: "FX crosses" },
  { label: "NZD/CAD", tv: "FX:NZDCAD", cat: "FX crosses" },
  { label: "NZD/CHF", tv: "FX:NZDCHF", cat: "FX crosses" },
  { label: "CAD/JPY", tv: "FX:CADJPY", cat: "FX crosses" },
  { label: "CAD/CHF", tv: "FX:CADCHF", cat: "FX crosses" },
  { label: "CHF/JPY", tv: "FX:CHFJPY", cat: "FX crosses" },
  // Metals
  { label: "XAU/USD", tv: "OANDA:XAUUSD", cat: "Metals" },
  { label: "XAG/USD", tv: "OANDA:XAGUSD", cat: "Metals" },
  // Crypto
  { label: "BTC/USD", tv: "COINBASE:BTCUSD", cat: "Crypto" },
  { label: "ETH/USD", tv: "COINBASE:ETHUSD", cat: "Crypto" },
  { label: "XRP/USD", tv: "COINBASE:XRPUSD", cat: "Crypto" },
  { label: "SOL/USD", tv: "COINBASE:SOLUSD", cat: "Crypto" },
  { label: "DOGE/USD", tv: "COINBASE:DOGEUSD", cat: "Crypto" },
  { label: "ADA/USD", tv: "COINBASE:ADAUSD", cat: "Crypto" },
  { label: "LTC/USD", tv: "COINBASE:LTCUSD", cat: "Crypto" },
  // Indices (no "/" in the label: not position-sizable in the risk engine yet)
  { label: "US30", tv: "OANDA:US30USD", cat: "Indices" },
  { label: "NAS100", tv: "OANDA:NAS100USD", cat: "Indices" },
  { label: "SPX500", tv: "OANDA:SPX500USD", cat: "Indices" },
  { label: "UK100", tv: "OANDA:UK100GBP", cat: "Indices" },
  { label: "GER40", tv: "OANDA:DE30EUR", cat: "Indices" },
  { label: "JP225", tv: "OANDA:JP225USD", cat: "Indices" },
  // Energy
  { label: "WTI OIL", tv: "OANDA:WTICOUSD", cat: "Energy" },
  { label: "BRENT OIL", tv: "OANDA:BCOUSD", cat: "Energy" },
  { label: "NATGAS", tv: "OANDA:NATGASUSD", cat: "Energy" },
];

export const PAIR_CATEGORIES = ["FX majors", "FX crosses", "Metals", "Crypto", "Indices", "Energy"] as const;

// Starter watchlist: what the app shipped with before pairs became configurable.
export const DEFAULT_PAIRS = [
  "EUR/USD", "GBP/USD", "AUD/USD", "NZD/USD",
  "USD/JPY", "USD/CHF", "USD/CAD",
  "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/GBP",
  "XAU/USD", "BTC/USD", "US30", "NAS100",
];

export const pairInfo = (label: string) => PAIR_CATALOG.find((p) => p.label === label);
export const tvSymbolFor = (label: string) => pairInfo(label)?.tv ?? null;
// The risk engine sizes anything quoted as BASE/QUOTE.
export const isSizable = (label: string) => label.includes("/");
