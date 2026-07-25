"use client";

import { useEffect, useRef, useState } from "react";

type TVWindow = {
  TradingView?: { widget: new (opts: Record<string, unknown>) => unknown };
};

export default function TradingViewChart({
  symbol,
  studies = [],
}: {
  symbol: string;
  studies?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const studiesKey = JSON.stringify(studies);

  useEffect(() => {
    const read = () =>
      setTheme((document.documentElement.dataset.theme as "dark" | "light") || "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const create = () => {
      const w = window as unknown as TVWindow;
      if (!w.TradingView || !ref.current) return;
      ref.current.innerHTML = "";
      new w.TradingView.widget({
        container_id: "tv_chart",
        symbol,
        interval: "60",
        theme,
        style: "1",
        locale: "en",
        autosize: true,
        timezone: "Etc/UTC",
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        details: false,
        studies: JSON.parse(studiesKey) as string[],
        backgroundColor: theme === "dark" ? "#161A23" : "#ffffff",
      });
    };

    const w = window as unknown as TVWindow;
    if (w.TradingView) {
      create();
    } else {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = create;
      document.body.appendChild(script);
    }
  }, [symbol, theme, studiesKey]);

  return <div id="tv_chart" ref={ref} className="h-full w-full" />;
}
