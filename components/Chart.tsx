"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import { Candle } from "@/lib/types";
import { sma, bollingerBands } from "@/lib/indicators";

interface ChartProps {
  candles: Candle[];
}

/**
 * Candlestick chart with a 20-period SMA and Bollinger Bands overlay.
 * Re-renders the full series on every candle-array change rather than
 * doing incremental .update() calls -- indicators depend on the whole
 * close-price window anyway, so a full recompute is simpler and, at a
 * few hundred points, cheap enough not to matter.
 */
export default function Chart({ candles }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bollUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bollLowerRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#15151f" },
        textColor: "#8a8a9e",
      },
      grid: {
        vertLines: { color: "#26263a" },
        horzLines: { color: "#26263a" },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#26263a" },
      rightPriceScale: { borderColor: "#26263a" },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#16c98d",
      downColor: "#f5455c",
      borderVisible: false,
      wickUpColor: "#16c98d",
      wickDownColor: "#f5455c",
    });
    smaSeriesRef.current = chart.addLineSeries({
      color: "#f5a524",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    bollUpperRef.current = chart.addLineSeries({
      color: "rgba(138,138,158,0.45)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    bollLowerRef.current = chart.addLineSeries({
      color: "rgba(138,138,158,0.45)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const candleData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(candleData);

    const closes = candles.map((c) => c.close);

    const smaArr = sma(closes, 20);
    const smaData = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: smaArr[i] }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null);
    smaSeriesRef.current?.setData(smaData);

    const boll = bollingerBands(closes, 20, 2);
    const upperData = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: boll.upper[i] }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null);
    const lowerData = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: boll.lower[i] }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null);
    bollUpperRef.current?.setData(upperData);
    bollLowerRef.current?.setData(lowerData);

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border"
    />
  );
}
