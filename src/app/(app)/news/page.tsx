"use client";

import { useEffect, useState } from "react";
import TVWidget from "@/components/TVWidget";
import NewsFeed from "@/components/news/NewsFeed";

function useAppTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () =>
      setTheme((document.documentElement.dataset.theme as "dark" | "light") || "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export default function NewsPage() {
  const theme = useAppTheme();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl">News</h1>
      <p className="mt-1 text-muted">Live market headlines, calendar, and cross-rates.</p>

      <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-border">
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
          height={78}
          config={{
            symbols: [
              { proName: "FX:EURUSD", title: "EUR/USD" },
              { proName: "FX:GBPUSD", title: "GBP/USD" },
              { proName: "FX:USDJPY", title: "USD/JPY" },
              { proName: "OANDA:XAUUSD", title: "Gold" },
              { proName: "COINBASE:BTCUSD", title: "BTC" },
              { proName: "OANDA:US30USD", title: "US30" },
            ],
            colorTheme: theme,
            isTransparent: false,
            displayMode: "adaptive",
            locale: "en",
          }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Market news</h2>
          <NewsFeed height={720} />
        </div>

        <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
          <h2 className="mb-2 px-1 pt-1 text-sm font-medium uppercase tracking-wide text-muted">Economic calendar</h2>
          <TVWidget
            src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
            height={720}
            config={{
              colorTheme: theme,
              isTransparent: false,
              locale: "en",
              importanceFilter: "0,1",
              currencyFilter: "USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD",
            }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-card p-3 ring-1 ring-border">
        <h2 className="mb-2 px-1 pt-1 text-sm font-medium uppercase tracking-wide text-muted">Forex heatmap</h2>
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js"
          height={640}
          config={{
            currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
            isTransparent: false,
            colorTheme: theme,
            locale: "en",
          }}
        />
      </div>
    </div>
  );
}
