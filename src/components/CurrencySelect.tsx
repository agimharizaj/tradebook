"use client";

// One currency picker for everywhere an account currency is chosen: the risk
// calculator, Settings > Trading profile, and prop-firm accounts. A select,
// not free text - a typo like "GPB" silently broke FX conversion and symbols.
// The list sticks to currencies /api/fx can convert (Frankfurter/ECB set).
export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
  "SGD", "HKD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF",
  "ZAR", "MXN", "TRY", "AED",
] as const;

export default function CurrencySelect({
  value,
  onChange,
  className = "field",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  // A saved value from the free-text days stays selectable instead of being
  // silently swapped for the first option.
  const known = (CURRENCIES as readonly string[]).includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {!known && value && <option value={value}>{value}</option>}
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
