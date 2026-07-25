"use client";

import { useEffect, useRef } from "react";

export default function TVWidget({
  src,
  config,
  height = 600,
}: {
  src: string;
  config: Record<string, unknown>;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cfg = JSON.stringify(config);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = cfg;
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [src, cfg]);

  return <div ref={ref} className="tradingview-widget-container" style={{ height }} />;
}
