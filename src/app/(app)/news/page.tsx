"use client";

import { useEffect, useState } from "react";
import TVWidget from "@/components/TVWidget";
import NewsFeed from "@/components/news/NewsFeed";
import MarketClocks from "@/components/sessions/MarketClocks";

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

// Tabs, deep-linkable via ?tab= like Settings (/sessions redirects to
// ?tab=sessions, the trading-day panel links here too). Widgets mount per
// tab on purpose: TradingView embeds missize inside display:none.
const TABS = [
  { id: "news", label: "News & calendar" },
  { id: "sessions", label: "Market sessions" },
  { id: "heatmap", label: "Heatmap" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function NewsPage() {
  const theme = useAppTheme();
  const mobile = useIsMobile();
  const tall = mobile ? 480 : 720;
  const [tab, setTab] = useState<TabId>("news");
  // TradingView's calendar always lists upcoming events; the one filter it
  // supports from outside is importance, so that's the toggle we expose.
  const [highOnly, setHighOnly] = useState(false);
  const [heatView, setHeatView] = useState<"pct" | "rates">("pct");
  // Send widget symbol clicks to our own Trading page instead of tradingview.com.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.id === t)) setTab(t as TabId);
  }, []);
  const largeChartUrl = origin ? `${origin}/trading` : undefined;

  function pickTab(id: TabId) {
    setTab(id);
    // Keep the URL shareable/refreshable without a navigation.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl">News</h1>
      <p className="mt-1 text-muted">Live market headlines, calendar, sessions, and cross-rates.</p>

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

      <div
        className="mt-5 inline-flex items-center gap-0.5 rounded-xl border border-border2 bg-surface2/60 p-1"
        role="tablist"
        aria-label="News sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pickTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "news" && (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
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
      )}

      {tab === "sessions" && (
        <div className="mt-5">
          <MarketClocks />
        </div>
      )}

      {tab === "heatmap" && (
        <div className="mt-5 rounded-2xl bg-card p-3 ring-1 ring-border">
          {/* Same currency grid, two views: % change (heat map) or the raw
              quoted rates (cross rates). TradingView widgets are iframes, so
              the values can't live in one grid - hence the toggle. */}
          <div className="mb-3 flex gap-1 rounded-xl border border-border2 bg-background p-1 w-fit">
            {([["pct", "% change"], ["rates", "Rates"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setHeatView(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  heatView === id ? "bg-accent text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {heatView === "pct" ? (
            <TVWidget
              src="https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js"
              height={mobile ? 420 : 560}
              config={{
                currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
                isTransparent: false,
                colorTheme: theme,
                locale: "en",
                largeChartUrl,
              }}
            />
          ) : (
            <TVWidget
              src="https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js"
              height={mobile ? 420 : 560}
              config={{
                currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
                isTransparent: false,
                colorTheme: theme,
                locale: "en",
                largeChartUrl,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
