"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type UTCTimestamp,
  type Time,
} from "lightweight-charts";
import type { BtTrade, Candle } from "@/lib/backtest";

// Candle replay chart. Renders candles[0..revealIndex] and price lines for
// the open trade; markers show closed trades. Colors match the brand ladder
// (teal profit / red loss on the dark charcoal canvas).

const UP = "#22D39A";
const DOWN = "#FF6274";

export default function ReplayChart({
  candles,
  revealIndex,
  openTrade,
  closedTrades,
  onPriceClick,
}: {
  candles: Candle[];
  revealIndex: number; // inclusive
  openTrade: { entry: number; stop: number; target: number | null } | null;
  closedTrades: BtTrade[];
  // When set, a click on the chart reports the price at the cursor (used by
  // the trade form to fill entry/stop/target from the chart).
  onPriceClick?: (price: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastIndexRef = useRef(-1);
  // Ref so the click subscription (registered once) always sees the latest
  // callback without re-creating the chart.
  const onPriceClickRef = useRef(onPriceClick);
  onPriceClickRef.current = onPriceClick;

  // Chart lifecycle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#9AA0B0",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,.05)" },
        horzLines: { color: "rgba(255,255,255,.05)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
      },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    lastIndexRef.current = -1;
    chart.subscribeClick((param) => {
      const cb = onPriceClickRef.current;
      if (!cb || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price != null) cb(price);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Reveal candles. Single-step forward is a cheap `update`; anything else
  // (initial load, jumps, new dataset) is a full `setData`.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || revealIndex < 0) return;
    const toBar = (c: Candle) => ({
      time: c.t as UTCTimestamp,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    });
    if (revealIndex === lastIndexRef.current + 1 && lastIndexRef.current >= 0) {
      const c = candles[revealIndex];
      if (c) series.update(toBar(c));
    } else {
      series.setData(candles.slice(0, revealIndex + 1).map(toBar));
      chartRef.current?.timeScale().scrollToRealTime();
    }
    lastIndexRef.current = revealIndex;
  }, [candles, revealIndex]);

  // Open-trade price lines.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    if (openTrade) {
      linesRef.current.push(
        series.createPriceLine({
          price: openTrade.entry,
          color: "#AB9DFF",
          lineWidth: 1,
          lineStyle: 0,
          title: "entry",
        }),
        series.createPriceLine({
          price: openTrade.stop,
          color: DOWN,
          lineWidth: 1,
          lineStyle: 2,
          title: "stop",
        })
      );
      if (openTrade.target != null) {
        linesRef.current.push(
          series.createPriceLine({
            price: openTrade.target,
            color: UP,
            lineWidth: 1,
            lineStyle: 2,
            title: "target",
          })
        );
      }
    }
  }, [openTrade]);

  // Closed-trade markers (entry and exit per trade).
  useEffect(() => {
    const markers: SeriesMarker<Time>[] = [];
    for (const t of closedTrades) {
      markers.push({
        time: t.enteredAt as UTCTimestamp,
        position: t.direction === "long" ? "belowBar" : "aboveBar",
        color: "#AB9DFF",
        shape: t.direction === "long" ? "arrowUp" : "arrowDown",
        text: t.direction === "long" ? "L" : "S",
      });
      if (t.exitedAt != null) {
        markers.push({
          time: t.exitedAt as UTCTimestamp,
          position: "inBar",
          color: (t.r ?? 0) >= 0 ? UP : DOWN,
          shape: "circle",
          text: t.r != null ? `${t.r >= 0 ? "+" : ""}${t.r.toFixed(1)}R` : "x",
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current?.setMarkers(markers);
  }, [closedTrades]);

  return <div ref={hostRef} className="h-full w-full" />;
}
