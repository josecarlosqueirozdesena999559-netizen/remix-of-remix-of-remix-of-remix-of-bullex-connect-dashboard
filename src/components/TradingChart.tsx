import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MarketCandle } from "@/hooks/useMarketData";

const CHART_HEIGHT = 680;
const MOBILE_CHART_HEIGHT = 560;
const VISIBLE_CANDLE_COUNT = 32;
const CHART_RIGHT_OFFSET = 4;
const CHART_TIME_ZONE = "America/Fortaleza";
const CHART_THEME = {
  background: "#06101f",
  text: "#ffffff",
  grid: "rgba(255, 255, 255, 0.08)",
  crosshair: "#ffffff",
  candleUp: "#00C853",
  candleDown: "#FF1744",
  candleUpWick: "#00C853",
  candleDownWick: "#FF1744",
  priceLine: "#ffffff",
  border: "#1d4f91",
  overlayBg: "rgba(3, 12, 26, 0.92)",
} as const;

type TradingChartOverlay = {
  disconnected?: boolean;
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
  const firstTimeRef = useRef<number | null>(null);
  const latestTimeRef = useRef<number | null>(null);
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
      localization: {
        locale: "pt-BR",
        timeFormatter: (time) => formatDateTimeLabel(time),
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
        tickMarkFormatter: (time) => formatAxisTimeLabel(time),
      },
    });

    const series = createSeriesForSymbol(chart, symbol, overlay?.currentPrice ?? null);

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setHoveredCandle(null);
        return;
      }

      const activeSeries = seriesRef.current;
      if (!activeSeries) {
        setHoveredCandle(null);
        return;
      }

      const hovered = param.seriesData.get(activeSeries) as MarketCandle | undefined;
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

    const symbolChanged = prevSymbolRef.current !== symbol;
    const firstCandle = candles[0] ?? null;
    const latestCandle = candles[candles.length - 1] ?? null;
    const firstTime = firstCandle ? Number(firstCandle.time) : null;

    if (symbolChanged) {
      console.log("[SYMBOL_CHANGED]", {
        from: prevSymbolRef.current || null,
        to: symbol,
      });
      setHoveredCandle(null);
      const nextSeries = recreateSeries(chart, series, symbol, overlay?.currentPrice ?? null);
      seriesRef.current = nextSeries;
      resetChartForSymbolChange(chart, nextSeries, candles);
      prevSymbolRef.current = symbol;
      prevLengthRef.current = candles.length;
      firstTimeRef.current = firstTime;
      latestTimeRef.current = latestCandle ? Number(latestCandle.time) : null;
      return;
    }

    series.applyOptions({
      priceFormat: buildPriceFormat(symbol, overlay?.currentPrice ?? null),
      upColor: CHART_THEME.candleUp,
      downColor: CHART_THEME.candleDown,
      borderUpColor: CHART_THEME.candleUp,
      borderDownColor: CHART_THEME.candleDown,
      wickUpColor: CHART_THEME.candleUpWick,
      wickDownColor: CHART_THEME.candleDownWick,
    });

    if (candles.length === 0) {
      series.setData([]);
      chart.timeScale().fitContent();
      resetPriceScale(chart);
      console.log("[CHART_RESET]", { symbol, candles: 0 });
      console.log("[PRICE_SCALE_RESET]", { symbol, reason: "empty_data" });
      prevLengthRef.current = 0;
      firstTimeRef.current = null;
      latestTimeRef.current = null;
      return;
    }

    if (
      prevLengthRef.current === 0 ||
      candles.length < prevLengthRef.current ||
      candles.length - prevLengthRef.current > 1 ||
      (firstTimeRef.current != null && firstTime != null && firstTime !== firstTimeRef.current)
    ) {
      series.setData(candles);
      resetPriceScale(chart);
      focusLatestCandles(chart, candles.length);
      console.log("[PRICE_SCALE_RESET]", { symbol, reason: "setData" });
      firstTimeRef.current = firstTime;
      latestTimeRef.current = latestCandle ? Number(latestCandle.time) : null;
    } else if (latestCandle) {
      const nextTime = Number(latestCandle.time);
      const previousTime = latestTimeRef.current;
      series.update(latestCandle);
      latestTimeRef.current = nextTime;

      if (previousTime == null || nextTime !== previousTime) {
        focusLatestCandles(chart, candles.length);
        console.log("[TIMESCALE_FIXED]", { symbol, latest_time: latestCandle.time });
      } else {
        keepLatestCandleVisible(chart);
      }
    }

    prevLengthRef.current = candles.length;
  }, [candles, symbol, overlay?.currentPrice]);

  useEffect(() => {
    const syncLatestPosition = () => {
      const chart = chartRef.current;
      if (!chart || candles.length === 0) return;
      focusLatestCandles(chart, candles.length);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncLatestPosition();
    };

    window.addEventListener("focus", syncLatestPosition);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncLatestPosition);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [candles.length]);

  const displayedCandle = hoveredCandle;

  return (
    <div className="relative min-h-[592px] p-4 md:min-h-[712px]">
      <div
        ref={containerRef}
        className="h-[560px] w-full overflow-hidden rounded-xl border md:h-[680px]"
        style={{
          background:
            "radial-gradient(circle at top, rgba(29,78,216,0.16), transparent 35%), linear-gradient(180deg, #07111f 0%, #030712 100%)",
          borderColor: CHART_THEME.border,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 44px rgba(2, 6, 23, 0.45)",
        }}
      />

      {false && (
      <div
        className="pointer-events-none absolute left-4 top-4 z-20 max-w-[calc(100%-2rem)] rounded-xl border px-4 py-3 text-xs shadow-lg backdrop-blur sm:left-8 sm:top-8 sm:max-w-[560px]"
        style={{
          background: CHART_THEME.overlayBg,
          borderColor: "rgba(255, 255, 255, 0.16)",
        }}
      >
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
          <OverlayRow label="Ativo atual" value={symbol} />
          <OverlayRow
            label="Preço atual"
            value={overlay?.currentPrice != null ? formatNumber(overlay.currentPrice) : "-"}
          />
          <OverlayRow label="Timeframe" value={timeframe} />
          <OverlayRow label="Status" value={overlay?.realtimeStatus ?? "-"} />
          {!overlay?.disconnected ? (
            <OverlayRow label="Melhor ativo" value={overlay?.bestSymbol ?? "-"} />
          ) : null}
          <OverlayRow label="Direção" value={overlay?.direction ?? "-"} />
          <OverlayRow label="Score/confiança" value={formatScoreConfidence(overlay)} />
          <OverlayRow label="Estratégia" value={overlay?.strategy ?? "-"} />
          {!overlay?.disconnected ? (
            <OverlayRow label="Entrada em" value={overlay?.entryCountdown ?? "-"} />
          ) : null}
          <OverlayRow label="WIN/LOSS" value={overlay?.result ?? "-"} />
        </div>
      </div>
      )}

      {displayedCandle && (
        <div
          className="pointer-events-none absolute right-8 top-8 z-20 rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            background: CHART_THEME.overlayBg,
            borderColor: "rgba(255, 255, 255, 0.16)",
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
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="break-words text-sm font-semibold leading-snug text-foreground">{value}</div>
    </div>
  );
}

function createCandlestickSeries(
  chart: IChartApi,
  candleOptions: {
    upColor: string;
    downColor: string;
    borderVisible: boolean;
    borderUpColor: string;
    borderDownColor: string;
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

function createSeriesForSymbol(chart: IChartApi, symbol: string, lastPrice: number | null) {
  return createCandlestickSeries(chart, {
    upColor: CHART_THEME.candleUp,
    downColor: CHART_THEME.candleDown,
    borderVisible: true,
    borderUpColor: CHART_THEME.candleUp,
    borderDownColor: CHART_THEME.candleDown,
    wickUpColor: CHART_THEME.candleUpWick,
    wickDownColor: CHART_THEME.candleDownWick,
    priceLineColor: CHART_THEME.priceLine,
    lastValueVisible: true,
    wickVisible: true,
    priceFormat: buildPriceFormat(symbol, lastPrice),
  });
}

function recreateSeries(
  chart: IChartApi,
  currentSeries: CandlestickSeriesApi,
  symbol: string,
  lastPrice: number | null,
) {
  chart.removeSeries(currentSeries);
  return createSeriesForSymbol(chart, symbol, lastPrice);
}

function focusLatestCandles(chart: IChartApi, candleCount: number) {
  if (candleCount <= 0) {
    chart.timeScale().fitContent();
    console.log("[TIMESCALE_FIXED]", { visible_candles: 0 });
    return;
  }

  const lastIndex = candleCount - 1;
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, candleCount - VISIBLE_CANDLE_COUNT),
    to: lastIndex + CHART_RIGHT_OFFSET,
  });
  console.log("[TIMESCALE_FIXED]", { visible_candles: candleCount });
}

function keepLatestCandleVisible(chart: IChartApi) {
  chart.timeScale().applyOptions({
    rightOffset: CHART_RIGHT_OFFSET,
  });
  chart.timeScale().scrollToPosition(CHART_RIGHT_OFFSET, false);
}

function resetPriceScale(chart: IChartApi) {
  chart.priceScale("right").applyOptions({
    autoScale: true,
  });
}

function resetChartForSymbolChange(
  chart: IChartApi,
  series: CandlestickSeriesApi,
  candles: MarketCandle[],
) {
  console.log("[CHART_RESET]", { candles: candles.length });
  series.setData([]);
  chart.timeScale().resetTimeScale();
  resetPriceScale(chart);
  console.log("[PRICE_SCALE_RESET]", { reason: "symbol_change" });
  series.setData(candles);
  chart.timeScale().fitContent();
  focusLatestCandles(chart, candles.length);
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
    timeZone: CHART_TIME_ZONE,
  }).format(date);
}

function formatAxisTimeLabel(time: Time) {
  const date = toDate(time);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CHART_TIME_ZONE,
  }).format(date);
}

function formatDateTimeLabel(time: Time) {
  const date = toDate(time);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: CHART_TIME_ZONE,
  }).format(date);
}

function toDate(time: Time) {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }

  if ("timestamp" in time && typeof time.timestamp === "number") {
    return new Date(time.timestamp * 1000);
  }

  if ("year" in time && "month" in time && "day" in time) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  return null;
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
