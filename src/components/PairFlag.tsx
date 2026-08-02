// Overlapping instrument badges for trade rows: country flags for fiat legs,
// monospace roundels for metals/crypto/indices/energy. Flags and emotion
// emoji are treated as data (they identify the instrument), not UI icons,
// so the no-emoji-icons rule does not apply; non-flag instruments get text
// roundels which also cover platforms without flag emoji.
const FLAG: Record<string, string> = {
  EUR: "🇪🇺", USD: "🇺🇸", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  NZD: "🇳🇿", CAD: "🇨🇦", CHF: "🇨🇭", SGD: "🇸🇬", HKD: "🇭🇰",
  SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰", PLN: "🇵🇱", ZAR: "🇿🇦",
  AED: "🇦🇪", MXN: "🇲🇽", TRY: "🇹🇷", CNH: "🇨🇳",
};

function Leg({ code, size }: { code: string; size: number }) {
  const flag = FLAG[code];
  const style = { width: size, height: size, fontSize: flag ? size * 0.62 : size * 0.34 };
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border2 bg-surface2 font-mono font-medium leading-none text-muted [&+&]:-ml-1.5"
      aria-hidden="true"
    >
      {flag ?? code.slice(0, 3)}
    </span>
  );
}

export default function PairFlag({ pair, size = 20 }: { pair: string | null; size?: number }) {
  if (!pair) return null;
  const legs = pair.includes("/") ? pair.split("/").slice(0, 2) : [pair];
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {legs.map((l, i) => (
        <Leg key={`${l}-${i}`} code={l.trim().toUpperCase()} size={size} />
      ))}
    </span>
  );
}
