"use client";

import TVWidget from "@/components/TVWidget";

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl">News</h1>
      <p className="mt-1 text-muted">Live market headlines and the economic calendar.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
          <h2 className="mb-2 px-2 pt-1 text-sm font-medium uppercase tracking-wide text-muted">Market news</h2>
          <TVWidget
            src="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
            height={620}
            config={{
              feedMode: "market",
              market: "forex",
              isTransparent: true,
              displayMode: "regular",
              colorTheme: "dark",
              locale: "en",
              width: "100%",
              height: "100%",
            }}
          />
        </div>

        <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
          <h2 className="mb-2 px-2 pt-1 text-sm font-medium uppercase tracking-wide text-muted">Economic calendar</h2>
          <TVWidget
            src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
            height={620}
            config={{
              colorTheme: "dark",
              isTransparent: true,
              locale: "en",
              importanceFilter: "0,1",
              currencyFilter: "USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD",
              width: "100%",
              height: "100%",
            }}
          />
        </div>
      </div>
    </div>
  );
}
