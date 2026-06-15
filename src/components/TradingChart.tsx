import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, LineStyle, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { MarketCandle } from "@/hooks/useMarketData";

const CHART_HEIGHT = 680;
const MOBILE_CHART_HEIGHT = 560;
const VISIBLE_CANDLE_COUNT = 32;
const CHART_RIGHT_OFFSET = 4;

type TradingChartOverlay = {
  currentPrice: number | null;
  realtimeStatus: string;
  bestSymbol: string | null;
  direction: string | null;
  confidence: number | null;
  score: number | null;
  strategy: string | null;
  entryCountdown: string | null;
  result: string | null;
};

type TradingChartProps = {
  symbol: string;
  timeframe: string;
  candles: MarketCandle[];
  overlay?: TradingChartOverlay;
};

type CandlestickSeriesApi = ReturnType<IChartApi["addCandlestickSeries"]>;

export function TradingChart({ symbol, timeframe, candles, overlay }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<CandlestickSeriesApi | null>(null);
  const prevSymbolRef = useRef("");
  const prevLengthRef = useRef(0);
  const [hoveredCandle, setHoveredCandle] = useState<MarketCandle | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartRef.current) return;

    const chart = createChart(container, {
      width: Math.max(1, Math.floor(container.getBoundingClientRect().width)),
      height: CHART_HEIGHT,
      layout: {
        background: { color: "#111827" },
        textColor: "#9CA3AF",
      },
      grid: {
        vertLines: { color: "#1F2937", style: LineStyle.Solid },
        horzLines: { color: "#1F2937", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#6B7280",
          style: LineStyle.Dashed,
          width: 1,
          labelVisible: true,
        },
        horzLine: {
          color: "#6B7280",
          style: LineStyle.Dashed,
          width: 1,
          labelVisible: true,
        },
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        borderVisible: false,
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: CHART_RIGHT_OFFSET,
        barSpacing: 12,
        minBarSpacing: 5,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderUpColor: "#22C55E",
      borderDownColor: "#EF4444",
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
      priceLineColor: "#22C55E",
      lastValueVisible: true,
      borderVisible: true,
      wickVisible: true,
      priceFormat: buildPriceFormat(symbol, overlay?.currentPrice ?? null),
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setHoveredCandle(null);
        return;
      }

      const hovered = param.seriesData.get(series) as MarketCandle | undefined;
      setHoveredCandle(hovered ?? null);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: window.matchMedia("(min-width: 768px)").matches
          ? CHART_HEIGHT
          : MOBILE_CHART_HEIGHT,
      });
    });

    resizeObserver.observe(container);
    chartRef.current = chart;
    seriesRef.current = series;
    console.log("[CHART_INIT]", { symbol, timeframe });

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    series.applyOptions({
      priceFormat: buildPriceFormat(symbol, overlay?.currentPrice ?? null),
    });

    const symbolChanged = prevSymbolRef.current !== symbol;
    const latestCandle = candles[candles.length - 1];

    if (symbolChanged) {
      console.log("[CHART_SYMBOL_CHANGED]", {
        from: prevSymbolRef.current || null,
        to: symbol,
      });
      series.setData(candles);
      focusLatestCandles(chart, candles.length);
      prevSymbolRef.current = symbol;
      prevLengthRef.current = candles.length;
      return;
    }

    if (candles.length === 0) return;

    if (
      prevLengthRef.current === 0 ||
      candles.length < prevLengthRef.current ||
      candles.length - prevLengthRef.current > 1
    ) {
      series.setData(candles);
      focusLatestCandles(chart, candles.length);
    } else if (latestCandle) {
      series.update(latestCandle);
    }

    prevLengthRef.current = candles.length;
  }, [candles, symbol, overlay?.currentPrice]);

  const displayedCandle = hoveredCandle ?? candles[candles.length - 1] ?? null;

  return (
    <div className="relative min-h-[592px] p-4 md:min-h-[712px]">
      <div
        ref={containerRef}
        className="h-[560px] w-full overflow-hidden rounded-xl border border-border/60 bg-card md:h-[680px]"
      />

      <div className="pointer-events-none absolute left-8 top-8 z-20 max-w-[min(92%,420px)] rounded-xl border border-border/80 bg-background/95 px-4 py-3 text-xs shadow-lg backdrop-blur">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <OverlayRow label="Ativo atual" value={symbol} />
          <OverlayRow
            label="Preço atual"
            value={overlay?.currentPrice != null ? formatNumber(overlay.currentPrice) : "-"}
          />
          <OverlayRow label="Timeframe" value={timeframe} />
          <OverlayRow label="Status" value={overlay?.realtimeStatus ?? "-"} />
          <OverlayRow label="Melhor ativo" value={overlay?.bestSymbol ?? "-"} />
          <OverlayRow label="Direção" value={overlay?.direction ?? "-"} />
          <OverlayRow label="Score/confiança" value={formatScoreConfidence(overlay)} />
          <OverlayRow label="Estratégia" value={overlay?.strategy ?? "-"} />
          <OverlayRow label="Entrada em" value={overlay?.entryCountdown ?? "-"} />
          <OverlayRow label="WIN/LOSS" value={overlay?.result ?? "-"} />
        </div>
      </div>

      {displayedCandle && (
        <div className="pointer-events-none absolute right-8 top-8 z-20 rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <div className="font-semibold text-foreground">{formatTime(displayedCandle.time)}</div>
          <div className="mt-1 text-muted-foreground">Open {formatNumber(displayedCandle.open)}</div>
          <div className="text-muted-foreground">High {formatNumber(displayedCandle.high)}</div>
          <div className="text-muted-foreground">Low {formatNumber(displayedCandle.low)}</div>
          <div className="text-muted-foreground">Close {formatNumber(displayedCandle.close)}</div>
        </div>
      )}
    </div>
  );
}

function OverlayRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function focusLatestCandles(chart: IChartApi, candleCount: number) {
  if (candleCount <= 0) {
    chart.timeScale().fitContent();
    return;
  }

  const lastIndex = candleCount - 1;
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, candleCount - VISIBLE_CANDLE_COUNT),
    to: lastIndex + CHART_RIGHT_OFFSET,
  });
}

function buildPriceFormat(symbol: string, lastPrice: number | null) {
  if (
    symbol.includes("EUR") ||
    symbol.includes("GBP") ||
    symbol.includes("AUD") ||
    symbol.includes("NZD")
  ) {
    return { type: "price" as const, precision: 5, minMove: 0.00001 };
  }

  if (symbol.includes("JPY")) {
    return { type: "price" as const, precision: 3, minMove: 0.001 };
  }

  if (symbol.includes("BTC") || symbol.includes("ETH")) {
    return { type: "price" as const, precision: 2, minMove: 0.01 };
  }

  const abs = Math.abs(lastPrice ?? 0);
  if (abs >= 1000) return { type: "price" as const, precision: 2, minMove: 0.01 };
  if (abs >= 1) return { type: "price" as const, precision: 4, minMove: 0.0001 };
  return { type: "price" as const, precision: 6, minMove: 0.000001 };
}

function formatTime(value: UTCTimestamp) {
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatScoreConfidence(overlay?: TradingChartOverlay) {
  const score = overlay?.score != null ? formatNumber(overlay.score) : "-";
  const confidence =
    overlay?.confidence != null ? `${formatNumber(overlay.confidence)}%` : "-";
  return `${score} / ${confidence}`;
}
