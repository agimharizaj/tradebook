"use client";

import { useEffect, useRef } from "react";

type TVWindow = {
  TradingView?: { widget: new (opts: Record<string, unknown>) => unknown };
};

export default function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

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
        theme: "dark",
        style: "1",
        locale: "en",
        autosize: true,
        timezone: "Etc/UTC",
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        details: false,
        backgroundColor: "#161A23",
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
  }, [symbol]);

  return <div id="tv_chart" ref={ref} className="h-full w-full" />;
}
