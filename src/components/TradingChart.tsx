import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MarketCandle } from "@/hooks/useMarketData";

const CHART_HEIGHT = 680;
const MOBILE_CHART_HEIGHT = 560;
const VISIBLE_CANDLE_COUNT = 32;
const CHART_RIGHT_OFFSET = 4;
const CHART_THEME = {
  background: "#06101f",
  text: "#a5b4c7",
  grid: "#16314f",
  crosshair: "#6ea8dc",
  candleUp: "#38bdf8",
  candleDown: "#fb7185",
  candleUpWick: "#7dd3fc",
  candleDownWick: "#fda4af",
  priceLine: "#60a5fa",
  border: "#1d4f91",
  overlayBg: "rgba(3, 12, 26, 0.92)",
} as const;

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

type CandlestickSeriesApi = ISeriesApi<"Candlestick", UTCTimestamp, MarketCandle, MarketCandle>;

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
        background: { color: CHART_THEME.background },
        textColor: CHART_THEME.text,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid, style: LineStyle.Solid },
        horzLines: { color: CHART_THEME.grid, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: CHART_THEME.crosshair,
          style: LineStyle.Dashed,
          width: 1,
          labelVisible: true,
        },
        horzLine: {
          color: CHART_THEME.crosshair,
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

    const candleOptions = {
      upColor: CHART_THEME.candleUp,
      downColor: CHART_THEME.candleDown,
      borderVisible: false,
      wickUpColor: CHART_THEME.candleUpWick,
      wickDownColor: CHART_THEME.candleDownWick,
      priceLineColor: CHART_THEME.priceLine,
      lastValueVisible: true,
      wickVisible: true,
      priceFormat: buildPriceFormat(symbol, overlay?.currentPrice ?? null),
    };

    const series = createCandlestickSeries(chart, candleOptions);

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
        className="h-[560px] w-full overflow-hidden rounded-xl border md:h-[680px]"
        style={{
          background:
            "radial-gradient(circle at top, rgba(29,78,216,0.16), transparent 35%), linear-gradient(180deg, #07111f 0%, #030712 100%)",
          borderColor: CHART_THEME.border,
          boxShadow: "inset 0 1px 0 rgba(125,211,252,0.08), 0 16px 44px rgba(2, 6, 23, 0.45)",
        }}
      />

      <div
        className="pointer-events-none absolute left-8 top-8 z-20 max-w-[min(92%,420px)] rounded-xl border px-4 py-3 text-xs shadow-lg backdrop-blur"
        style={{
          background: CHART_THEME.overlayBg,
          borderColor: "rgba(96, 165, 250, 0.28)",
        }}
      >
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
        <div
          className="pointer-events-none absolute right-8 top-8 z-20 rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            background: CHART_THEME.overlayBg,
            borderColor: "rgba(96, 165, 250, 0.28)",
          }}
        >
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

function createCandlestickSeries(
  chart: IChartApi,
  candleOptions: {
    upColor: string;
    downColor: string;
    borderVisible: boolean;
    wickUpColor: string;
    wickDownColor: string;
    priceLineColor: string;
    lastValueVisible: boolean;
    wickVisible: boolean;
    priceFormat: ReturnType<typeof buildPriceFormat>;
  },
) {
  const compatibleChart = chart as IChartApi & {
    addSeries?: (
      definition: typeof CandlestickSeries,
      options: typeof candleOptions,
    ) => CandlestickSeriesApi;
    addCandlestickSeries?: (options: typeof candleOptions) => CandlestickSeriesApi;
  };

  if (typeof compatibleChart.addSeries === "function") {
    return compatibleChart.addSeries(CandlestickSeries, candleOptions);
  }

  if (typeof compatibleChart.addCandlestickSeries === "function") {
    return compatibleChart.addCandlestickSeries(candleOptions);
  }

  throw new Error("Lightweight Charts candlestick API not available");
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
