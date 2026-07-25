import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Returns the exchange rate from `from` -> `to` using Frankfurter (ECB data).
// Free, no API key. Fiat majors only (no XAU / crypto).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.toUpperCase();
  const to = searchParams.get("to")?.toUpperCase();

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ rate: 1, date: null });
  }

  // Keyless CoinGecko ids for the cryptos in the pair catalog.
  const CRYPTO_IDS: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    XRP: "ripple",
    SOL: "solana",
    DOGE: "dogecoin",
    ADA: "cardano",
    LTC: "litecoin",
  };

  try {
    // Crypto: keyless spot price via CoinGecko.
    if (CRYPTO_IDS[from]) {
      const id = CRYPTO_IDS[from];
      const vs = to.toLowerCase();
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vs}`,
        { next: { revalidate: 120 } }
      );
      if (r.ok) {
        const j = await r.json();
        const price = j?.[id]?.[vs];
        if (typeof price === "number") return NextResponse.json({ rate: price, date: null });
      }
      // Fallback: price in USD, then convert USD -> target.
      const u = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
      ).then((x) => x.json());
      const usd = u?.[id]?.usd;
      if (typeof usd !== "number") throw new Error("crypto unavailable");
      if (to === "USD") return NextResponse.json({ rate: usd, date: null });
      const c = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${to}`).then((x) => x.json());
      const conv = c?.rates?.[to];
      if (typeof conv !== "number") throw new Error("conversion unavailable");
      return NextResponse.json({ rate: usd * conv, date: c.date ?? null });
    }

    // Metals (XAU gold / XAG silver): Frankfurter has no metals, so use a
    // keyless spot source.
    if (from === "XAU" || from === "XAG") {
      const g = await fetch(`https://api.gold-api.com/price/${from}`, {
        next: { revalidate: 300 },
      });
      if (!g.ok) throw new Error("metal fetch failed");
      const gj = await g.json();
      const usd = gj?.price;
      if (typeof usd !== "number") throw new Error("metal unavailable");
      if (to === "USD") return NextResponse.json({ rate: usd, date: null });
      // Convert USD -> target via Frankfurter.
      const c = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${to}`).then((r) => r.json());
      const conv = c?.rates?.[to];
      if (typeof conv !== "number") throw new Error("conversion unavailable");
      return NextResponse.json({ rate: usd * conv, date: c.date ?? null });
    }

    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    const rate = json?.rates?.[to];
    if (typeof rate !== "number") throw new Error("rate unavailable");
    return NextResponse.json({ rate, date: json.date ?? null });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
