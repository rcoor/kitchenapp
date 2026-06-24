import * as React from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/types";

export function PriceChart({ candles }: { candles: Candle[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9aa3b2",
        fontFamily: "Geist Mono, monospace",
      },
      grid: {
        vertLines: { color: "rgba(35,38,47,0.4)" },
        horzLines: { color: "rgba(35,38,47,0.4)" },
      },
      rightPriceScale: { borderColor: "#23262f" },
      timeScale: { borderColor: "#23262f", timeVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    const series = chart.addAreaSeries({
      lineColor: "#5eead4",
      topColor: "rgba(94,234,212,0.25)",
      bottomColor: "rgba(94,234,212,0.01)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: c.time as never, value: c.close })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={ref} className="h-[320px] w-full" />;
}
