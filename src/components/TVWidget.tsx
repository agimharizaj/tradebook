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
  // Force an exact numeric height so the widget never overflows its tile.
  const cfg = JSON.stringify({ ...config, width: "100%", height });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
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

  return (
    <div
      ref={ref}
      className="tradingview-widget-container overflow-hidden rounded-lg"
      style={{ height, width: "100%" }}
    />
  );
}
