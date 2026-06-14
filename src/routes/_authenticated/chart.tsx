import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  LineStyle,
  type CandlestickData,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { BarChart3, Loader2 } from "lucide-react";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useMarketData } from "@/hooks/useMarketData";
import { useRobotState } from "@/hooks/useRobotState";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/chart")({
  head: () => ({ meta: [{ title: "Gráfico em tempo real - BullEx AutoBot" }] }),
  component: MarketPage,
});

type Asset = {
  symbol: string;
  active_id: string | number;
  enabled: boolean;
  payout: number | null;
};

type Candle = CandlestickData<UTCTimestamp>;
type HoveredCandle = Candle | null;
type ChartApi = ReturnType<typeof createChart>;
type CandlestickSeriesApi = ReturnType<ChartApi["addSeries"]>;
const EMPTY_ASSETS: Asset[] = [];

function MarketPage() {
  const { user } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState("EURUSD-OTC");
  const [robotChartSymbol, setRobotChartSymbol] = useState<string | null>(null);
  const [followPrice, setFollowPrice] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle>(null);
  const account = useBullExAccount();
  const robotState = useRobotState(user?.id);
  const bestCandidate = robotState.data?.best_candidate ?? null;
  const chartSymbol = robotChartSymbol ?? selectedSymbol;

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRef = useRef<CandlestickSeriesApi | null>(null);
  const prevSymbolRef = useRef<string>("");
  const prevCandlesLengthRef = useRef(0);

  const assetsQuery = useQuery({
    queryKey: ["bullex", user?.id, "assets"],
    queryFn: async () => {
      try {
        const assetsResponse = await apiRequest<unknown>("/bullex/assets");
        console.log("[ASSETS RESPONSE]", assetsResponse);
        console.log("[ASSETS DATA]", assetsResponse.ok ? assetsResponse.data : undefined);
        console.log(
          "[ASSETS LENGTH]",
          assetsResponse.ok ? getCollectionLength(assetsResponse.data) : undefined,
        );

        return normalizeAssetsPayload(unwrap(assetsResponse))
          .map(normalizeAsset)
          .filter(Boolean) as Asset[];
      } catch (error) {
        console.error("[ASSETS ERROR]", error);
        throw error;
      }
    },
    enabled: Boolean(user?.id),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const selected = assets.find((asset) => asset.symbol === chartSymbol) ?? null;
  const {
    candles,
    candlesError,
    isCandlesLoading,
    isPayoutLoading,
    lastCandleReceivedAt,
    lastCandleTimestamp,
    lastPrice,
    payoutError,
    pollingStatus,
    selectedPayout,
  } = useMarketData(chartSymbol || null);

  useEffect(() => {
    if (!bestCandidate?.symbol) return;
    setRobotChartSymbol(bestCandidate.symbol);
    setFollowPrice(true);
  }, [bestCandidate?.symbol]);

  useEffect(() => {
    if (assets.length === 0) return;
    if (robotChartSymbol) return;
    if (assets.some((asset) => asset.symbol === selectedSymbol)) return;

    const defaultAsset = assets.find((asset) => asset.symbol === "EURUSD-OTC") ?? assets[0];

    if (defaultAsset?.symbol) {
      setSelectedSymbol(defaultAsset.symbol);
    }
  }, [assets, robotChartSymbol, selectedSymbol]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || chartRef.current) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 520,
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
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
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
      priceFormat: buildPriceFormat("", null),
    });

    chart.subscribeCrosshairMove((param: MouseEventParams<UTCTimestamp>) => {
      const data = series.dataByIndex?.(0, 0); // noop access to satisfy typings on some builds
      void data;

      if (!param.point || !param.time) {
        setHoveredCandle(null);
        return;
      }

      const hovered = param.seriesData.get(series) as Candle | undefined;
      setHoveredCandle(hovered ?? null);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: Math.floor(entry.contentRect.width),
        height: 520,
      });
    });

    resizeObserver.observe(container);

    const stopFollowingPrice = () => {
      setFollowPrice((current) => {
        if (!current) return current;
        console.log("[CHART FOLLOW PRICE]", { symbol: prevSymbolRef.current, enabled: false });
        return false;
      });
    };

    container.addEventListener("wheel", stopFollowingPrice, { passive: true });
    container.addEventListener("mousedown", stopFollowingPrice);
    container.addEventListener("touchstart", stopFollowingPrice, { passive: true });

    chartRef.current = chart;
    seriesRef.current = series;
    console.log("[CHART INIT]");

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("wheel", stopFollowingPrice);
      container.removeEventListener("mousedown", stopFollowingPrice);
      container.removeEventListener("touchstart", stopFollowingPrice);
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
      priceFormat: buildPriceFormat(chartSymbol, lastPrice),
    });
    chart.priceScale("right").applyOptions({
      autoScale: true,
      borderVisible: false,
      visible: true,
    });

    const symbolChanged = prevSymbolRef.current !== chartSymbol;
    console.log("[CHART UPDATE]", {
      symbol: chartSymbol,
      candles: candles.length,
      symbolChanged,
    });

    if (symbolChanged) {
      series.setData(candles);
      chart.timeScale().fitContent();
      prevSymbolRef.current = chartSymbol;
      prevCandlesLengthRef.current = candles.length;
    } else if (candles.length === 0) {
      series.setData([]);
      prevCandlesLengthRef.current = 0;
    } else if (prevCandlesLengthRef.current === 0 || candles.length < prevCandlesLengthRef.current) {
      series.setData(candles);
      prevCandlesLengthRef.current = candles.length;
    } else if (followPrice && candles.length > 0) {
      const latestCandle = candles[candles.length - 1];
      if (latestCandle) {
        series.update(latestCandle);
      }
      prevCandlesLengthRef.current = candles.length;
      chart.timeScale().scrollToRealTime();
      console.log("[CHART FOLLOW PRICE]", { symbol: chartSymbol, enabled: true });
    } else {
      const latestCandle = candles[candles.length - 1];
      if (latestCandle) {
        series.update(latestCandle);
      }
      prevCandlesLengthRef.current = candles.length;
    }
  }, [candles, chartSymbol, followPrice, lastPrice]);

  const sessionMissing =
    isSessionError(account.error) ||
    isSessionError(assetsQuery.error) ||
    isSessionError(candlesError) ||
    isSessionError(payoutError);

  const assetNotAllowedError =
    isAssetNotAllowed(assetsQuery.error) ||
    isAssetNotAllowed(candlesError) ||
    isAssetNotAllowed(payoutError);

  const displayedCandle = hoveredCandle ?? candles[candles.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mercado binário - 21 pares monitorados</h1>
        <p className="text-sm text-muted-foreground">
          Selecione um ativo para acompanhar os candles retornados pela BullEx.
        </p>
      </header>

      {sessionMissing && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          {getBinaryMarketErrorMessage("SESSION_DISCONNECTED")}
        </div>
      )}

      {assetNotAllowedError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {getBinaryMarketErrorMessage("ASSET_NOT_ALLOWED")}
        </div>
      )}

      {assetsQuery.error &&
        !isSessionError(assetsQuery.error) &&
        !isAssetNotAllowed(assetsQuery.error) && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {assetsQuery.error instanceof Error
              ? assetsQuery.error.message
              : "Erro ao carregar ativos"}
          </div>
        )}

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Ativo
            </label>
            <select
              value={chartSymbol}
              onChange={(event) => {
                setRobotChartSymbol(null);
                setSelectedSymbol(event.target.value);
              }}
              disabled={assetsQuery.isLoading || assets.length === 0}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            >
              <option value="">
                {assetsQuery.isLoading
                  ? "Carregando ativos..."
                  : assets.length === 0
                    ? "Nenhum ativo binário disponível no momento."
                    : "Selecione um ativo"}
              </option>
              {bestCandidate && !assets.some((asset) => asset.symbol === bestCandidate.symbol) ? (
                <option value={bestCandidate.symbol}>
                  {`${bestCandidate.symbol} | Melhor ativo`}
                </option>
              ) : null}
              {assets.map((asset) => (
                <option key={`${asset.symbol}-${asset.active_id}`} value={asset.symbol}>
                  {`${asset.symbol} | ID ${asset.active_id} | ${formatPayoutValue(getAssetPayout(asset, chartSymbol, selectedPayout))}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {bestCandidate ? <BadgeLabel label="Melhor ativo" value={bestCandidate.symbol} /> : null}
            <BadgeLabel
              label="Payout"
              value={isPayoutLoading ? "..." : formatPayoutValue(selectedPayout)}
            />
            <BadgeLabel label="Modo" value={formatAccountMode(account.data?.mode)} />
            <BadgeLabel
              label="Ultimo preco"
              value={lastPrice != null ? formatNumber(lastPrice) : "-"}
            />
            <BadgeLabel
              label="Ultimo candle"
              value={lastCandleTimestamp ? formatDateTimeFromTimestamp(lastCandleTimestamp) : "-"}
            />
            <BadgeLabel
              label="Recebido"
              value={lastCandleReceivedAt ? formatDateTime(lastCandleReceivedAt) : "-"}
            />
            <BadgeLabel label="Polling" value={formatPollingStatus(pollingStatus)} />
          </div>
        </div>

        {!assetsQuery.isLoading && assets.length === 0 && (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Nenhum ativo binário disponível no momento.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">{selected ? selected.symbol : "Selecione um ativo"}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                chartRef.current?.timeScale().fitContent();
                console.log("[CHART RESET ZOOM]");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Reset zoom
            </button>
            <button
              type="button"
              onClick={() => {
                setFollowPrice((current) => {
                  const next = !current;
                  console.log("[CHART FOLLOW PRICE]", { symbol: chartSymbol, enabled: next });
                  if (next) {
                    chartRef.current?.timeScale().scrollToRealTime();
                  }
                  return next;
                });
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Seguir preco {followPrice ? "ON" : "OFF"}
            </button>
            <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Intervalo 60s
            </span>
            {isCandlesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <BarChart3 className="h-4 w-4 text-primary" />
            )}
          </div>
        </div>

        {candlesError && !isSessionError(candlesError) && !isAssetNotAllowed(candlesError) && (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {candlesError instanceof Error ? candlesError.message : "Erro ao carregar candles"}
          </div>
        )}

        <div className="relative h-[520px] min-h-[520px] p-4">
          <div
            ref={chartContainerRef}
            className="h-[520px] w-full overflow-hidden rounded-xl border border-border/60 bg-card"
          />

          <div className="pointer-events-none absolute inset-4 z-10 flex select-none items-center justify-center overflow-hidden rounded-xl">
            <div className="flex items-center gap-4 text-foreground/10">
              <div className="hidden h-20 w-20 items-end gap-1.5 sm:flex" aria-hidden="true">
                <span className="h-8 w-2.5 rounded-sm bg-current" />
                <span className="h-14 w-2.5 rounded-sm bg-current" />
                <span className="h-20 w-2.5 rounded-sm bg-current" />
                <span className="h-11 w-2.5 rounded-sm bg-current" />
              </div>
              <span className="text-5xl font-black tracking-normal sm:text-7xl">BullEx</span>
            </div>
          </div>

          {displayedCandle && (
            <div className="pointer-events-none absolute right-8 top-8 z-20 rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <div className="font-semibold text-foreground">
                {formatTime(displayedCandle.time)}
              </div>
              <div className="mt-1 text-muted-foreground">
                Open {formatNumber(displayedCandle.open)}
              </div>
              <div className="text-muted-foreground">High {formatNumber(displayedCandle.high)}</div>
              <div className="text-muted-foreground">Low {formatNumber(displayedCandle.low)}</div>
              <div className="text-muted-foreground">
                Close {formatNumber(displayedCandle.close)}
              </div>
            </div>
          )}

          {chartSymbol && !isCandlesLoading && candles.length === 0 && !candlesError && (
            <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum candle normalizado retornado
            </div>
          )}

          {!chartSymbol && (
            <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
              Selecione um ativo para abrir o grafico.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">Ultimos 10 candles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-5 py-3">Hora</th>
                <th className="px-5 py-3">Open</th>
                <th className="px-5 py-3">High</th>
                <th className="px-5 py-3">Low</th>
                <th className="px-5 py-3">Close</th>
              </tr>
            </thead>
            <tbody>
              {candles.slice(-10).map((candle, index) => (
                <tr key={`${candle.time}-${index}`} className="border-b border-border/50">
                  <td className="px-5 py-3">{formatTime(candle.time)}</td>
                  <td className="px-5 py-3 font-mono">{formatNumber(candle.open)}</td>
                  <td className="px-5 py-3 font-mono">{formatNumber(candle.high)}</td>
                  <td className="px-5 py-3 font-mono">{formatNumber(candle.low)}</td>
                  <td className="px-5 py-3 font-mono">{formatNumber(candle.close)}</td>
                </tr>
              ))}
              {chartSymbol && !isCandlesLoading && candles.length === 0 && !candlesError && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={5}>
                    Nenhum candle normalizado retornado
                  </td>
                </tr>
              )}
              {!chartSymbol && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={5}>
                    Selecione um ativo para buscar candles.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BadgeLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiError(res.error, res.code);
  return res.data;
}

function isSessionError(error: unknown) {
  return error instanceof ApiError && isSessionErrorCode(error.code);
}

function isSessionErrorCode(code?: string | null) {
  return code === "SESSION_NOT_FOUND" || code === "SESSION_DISCONNECTED";
}

function isAssetNotAllowed(error: unknown) {
  return error instanceof ApiError && error.code === "ASSET_NOT_ALLOWED";
}

function getBinaryMarketErrorMessage(code?: string | null) {
  if (code === "ASSET_NOT_ALLOWED") {
    return "Ativo não permitido para análise binária.";
  }

  if (isSessionErrorCode(code)) {
    return "Conta BullEx desconectada. Reconecte sua conta.";
  }

  return code ?? "Erro inesperado no mercado binário.";
}

function normalizeCollection(input: unknown) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.assets)) return value.assets;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.result)) return value.result;
  }
  return [];
}

function normalizeAssetsPayload(input: unknown) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.assets)) return value.assets;
  }
  return normalizeCollection(input);
}

function getCollectionLength(input: unknown) {
  return normalizeAssetsPayload(input).length;
}

function normalizeAsset(item: unknown): Asset | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const symbol = String(value.symbol ?? value.active ?? value.name ?? value.asset ?? "");
  if (!symbol) return null;
  const rawPayout = value.payout ?? value.profit ?? value.percent;
  const payout = normalizeNumber(rawPayout);

  return {
    symbol,
    active_id: String(value.active_id ?? value.activeId ?? value.id ?? value.active ?? symbol),
    enabled: Boolean(value.enabled ?? value.is_enabled ?? value.open ?? value.status === "enabled"),
    payout,
  };
}

function normalizeNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function formatPollingStatus(status: string) {
  switch (status) {
    case "polling":
      return "REST ativo";
    case "error":
      return "REST erro";
    default:
      return "REST parado";
  }
}

function formatPayoutValue(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value}%`;
}

function getAssetPayout(asset: Asset, selectedSymbol: string, selectedPayout: number | null) {
  if (asset.symbol === selectedSymbol) {
    return selectedPayout ?? asset.payout;
  }

  return asset.payout;
}

function formatAccountMode(mode?: string) {
  return mode === "PRACTICE" || mode === "REAL" ? mode : "-";
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

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatDateTimeFromTimestamp(value: UTCTimestamp) {
  return formatDateTime(new Date(Number(value) * 1000));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(value);
}
