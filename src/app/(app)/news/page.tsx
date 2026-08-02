"use client";

import { useEffect, useState } from "react";
import TVWidget from "@/components/TVWidget";
import NewsFeed from "@/components/news/NewsFeed";

// Shorter embeds on phones so the page doesn't become a 2000px scroll.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

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
  const mobile = useIsMobile();
  const tall = mobile ? 480 : 720;
  // TradingView's calendar always lists upcoming events; the one filter it
  // supports from outside is importance, so that's the toggle we expose.
  const [highOnly, setHighOnly] = useState(false);
  // Send widget symbol clicks to our own Trading page instead of tradingview.com.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const largeChartUrl = origin ? `${origin}/trading` : undefined;

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
            largeChartUrl,
          }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Market news</h2>
          <NewsFeed height={tall} />
        </div>

        <div className="rounded-2xl bg-card p-3 ring-1 ring-border">
          <div className="mb-2 flex items-center justify-between gap-2 px-1 pt-1">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Economic calendar</h2>
            <div
              className="flex items-center gap-0.5 rounded-lg border border-border2 bg-surface2/60 p-0.5"
              role="group"
              aria-label="Event importance"
            >
              {([
                { on: false, label: "All impact" },
                { on: true, label: "High only" },
              ] as const).map((o) => (
                <button
                  key={o.label}
                  onClick={() => setHighOnly(o.on)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    highOnly === o.on ? "bg-accent text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <TVWidget
            src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
            height={tall}
            config={{
              colorTheme: theme,
              isTransparent: false,
              locale: "en",
              importanceFilter: highOnly ? "1" : "0,1",
              currencyFilter: "USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD",
            }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-card p-3 ring-1 ring-border">
        <h2 className="mb-2 px-1 pt-1 text-sm font-medium uppercase tracking-wide text-muted">Forex heatmap</h2>
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js"
          height={mobile ? 360 : 420}
          config={{
            currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
            isTransparent: false,
            colorTheme: theme,
            locale: "en",
            largeChartUrl,
          }}
        />
      </div>
    </div>
  );
}
