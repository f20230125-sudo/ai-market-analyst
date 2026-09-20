"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { Candle } from "@/lib/types";
import { rsi } from "@/lib/indicators";

/** Small RSI(14) sub-chart with 30/70 reference lines, below the main chart. */
export default function IndicatorPane({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
      height: 140,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#26263a" },
      rightPriceScale: { borderColor: "#26263a" },
    });
    chartRef.current = chart;

    rsiSeriesRef.current = chart.addLineSeries({
      color: "#c084fc",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    rsiSeriesRef.current.createPriceLine({
      price: 70,
      color: "#f5455c",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "70",
    });
    rsiSeriesRef.current.createPriceLine({
      price: 30,
      color: "#16c98d",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "30",
    });

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!rsiSeriesRef.current || candles.length === 0) return;
    const closes = candles.map((c) => c.close);
    const rsiArr = rsi(closes, 14);
    const data = candles
      .map((c, i) => ({ time: c.time as UTCTimestamp, value: rsiArr[i] }))
      .filter((d): d is { time: UTCTimestamp; value: number } => d.value != null);
    rsiSeriesRef.current.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border mt-2"
    />
  );
}
