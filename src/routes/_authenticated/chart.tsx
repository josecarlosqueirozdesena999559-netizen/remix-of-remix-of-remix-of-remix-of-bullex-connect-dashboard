import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useMarketSocket, type MarketSocketCandleMessage, type MarketSocketStatus } from "@/hooks/useMarketSocket";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/chart")({
  head: () => ({ meta: [{ title: "Grafico em tempo real - BullEx AutoBot" }] }),
  component: MarketPage,
});

type Asset = {
  symbol: string;
  active_id: string | number;
  enabled: boolean;
};

type Candle = CandlestickData<UTCTimestamp>;
type HoveredCandle = Candle | null;
type ChartApi = ReturnType<typeof createChart>;
type CandlestickSeriesApi = ReturnType<ChartApi["addSeries"]>;

type Payout = {
  active: string;
  payout: number | null;
};

function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedPayout, setSelectedPayout] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);
  const [isCandlesLoading, setIsCandlesLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<unknown>(null);
  const [candlesError, setCandlesError] = useState<unknown>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [followPrice, setFollowPrice] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<HoveredCandle>(null);
  const [socketStatus, setSocketStatus] = useState<MarketSocketStatus>("disconnected");
  const [socketMessage, setSocketMessage] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const account = useBullExAccount();

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRef = useRef<CandlestickSeriesApi | null>(null);
  const prevSymbolRef = useRef<string>("");

  const assetsQuery = useQuery({
    queryKey: ["bullex", "assets"],
    queryFn: async () => {
      try {
        const assetsResponse = await apiRequest<unknown>("/bullex/assets");
        console.log("[ASSETS RESPONSE]", assetsResponse);
        console.log("[ASSETS DATA]", assetsResponse.ok ? assetsResponse.data : undefined);
        console.log("[ASSETS LENGTH]", assetsResponse.ok ? getCollectionLength(assetsResponse.data) : undefined);

        return normalizeAssetsPayload(unwrap(assetsResponse))
          .map(normalizeAsset)
          .filter(Boolean) as Asset[];
      } catch (error) {
        console.error("[ASSETS ERROR]", error);
        throw error;
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const assets = assetsQuery.data ?? [];
  const tradableAssets = useMemo(
    () => assets.filter((asset) => asset.symbol.includes("-OTC")),
    [assets],
  );
  const selected =
    tradableAssets.find((asset) => asset.symbol === selectedSymbol) ??
    assets.find((asset) => asset.symbol === selectedSymbol) ??
    null;

  useEffect(() => {
    if (selectedSymbol) return;

    const defaultAsset =
      tradableAssets.find((asset) => asset.symbol === "EURUSD-OTC") ??
      tradableAssets[0] ??
      assets[0];

    if (defaultAsset?.symbol) {
      setSelectedSymbol(defaultAsset.symbol);
    }
  }, [assets, selectedSymbol, tradableAssets]);

  useEffect(() => {
    if (!selectedSymbol) {
      setSelectedPayout(null);
      setPayoutError(null);
      return;
    }

    let cancelled = false;

    const fetchPayout = async () => {
      setIsPayoutLoading(true);
      setPayoutError(null);
      try {
        const payoutResponse = await apiRequest<unknown>(
          `/bullex/payouts?active=${encodeURIComponent(selectedSymbol)}`,
        );
        console.log("[PAYOUT RESPONSE]", payoutResponse);
        const payout = normalizePayout(selectedSymbol, unwrap(payoutResponse)).payout;
        if (!cancelled) {
          setSelectedPayout(payout);
        }
      } catch (error) {
        console.error("[PAYOUT ERROR]", error);
        if (!cancelled) {
          setPayoutError(error);
          setSelectedPayout(null);
        }
      } finally {
        if (!cancelled) {
          setIsPayoutLoading(false);
        }
      }
    };

    void fetchPayout();

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) {
      setCandles([]);
      setLastPrice(null);
      setCandlesError(null);
      setLastUpdated(null);
      setHistoryReady(false);
      return;
    }

    let cancelled = false;
    setHistoryReady(false);

    const fetchCandlesHistory = async (symbol: string) => {
      setIsCandlesLoading(true);
      setCandlesError(null);

      const url = `/bullex/candles?active=${encodeURIComponent(symbol)}&interval=60&count=100`;
      console.log("[SELECTED SYMBOL]", symbol);
      console.log("[FETCH CANDLES URL]", url);

      try {
        const candlesResponse = await apiRequest<unknown>(url);
        console.log("[CANDLES RESPONSE]", candlesResponse);
        const nextCandles = normalizeCandlesPayload(symbol, unwrap(candlesResponse));
        console.log("[NORMALIZED CANDLES]", nextCandles.slice(-5));
        console.log("[CHART DATA]", nextCandles.slice(-10));
        console.log("[CANDLES LENGTH]", nextCandles.length);

        if (cancelled) return;

        if (nextCandles.length > 0) {
          setCandles(nextCandles);
          const nextLastPrice = nextCandles[nextCandles.length - 1]?.close ?? null;
          setLastPrice(nextLastPrice);
          console.log("[REALTIME LAST PRICE]", nextLastPrice);
        } else {
          setCandles([]);
          setLastPrice(null);
        }

        setLastUpdated(new Date());
        setHistoryReady(true);
      } catch (error) {
        console.error("[CANDLES ERROR]", error);
        if (!cancelled) {
          setCandlesError(error);
          setCandles([]);
          setLastPrice(null);
          setLastUpdated(null);
          setHistoryReady(false);
        }
      } finally {
        if (!cancelled) {
          setIsCandlesLoading(false);
        }
      }
    };

    void fetchCandlesHistory(selectedSymbol);

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  const handleSocketCandle = (message: MarketSocketCandleMessage) => {
    const nextCandle = normalizeSocketCandle(message);
    if (!nextCandle) return;

    seriesRef.current?.update(nextCandle);

    setCandles((current) => {
      const merged = mergeRealtimeCandle(current, nextCandle);
      const nextLastPrice = merged[merged.length - 1]?.close ?? null;
      setLastPrice(nextLastPrice);
      setLastUpdated(new Date());
      console.log("[REALTIME LAST PRICE]", nextLastPrice);
      return merged;
    });
  };

  const { status: marketSocketStatus, lastError: marketSocketError } = useMarketSocket({
    active: selectedSymbol || null,
    enabled: !!selectedSymbol && historyReady,
    onCandle: handleSocketCandle,
    onStatus: setSocketStatus,
  });

  useEffect(() => {
    setSocketStatus(marketSocketStatus);
  }, [marketSocketStatus]);

  useEffect(() => {
    if (marketSocketError === "SESSION_DISCONNECTED") {
      setSocketMessage("Sessao BullEx desconectada. Reconecte sua conta.");
      setCandlesError(new Error("Sessao BullEx desconectada. Reconecte sua conta."));
      return;
    }

    setSocketMessage(marketSocketError);
  }, [marketSocketError]);

  useEffect(() => {
    if (socketStatus === "connected") {
      setSocketMessage(null);
      setCandlesError((current) =>
        current instanceof Error && current.message === "Sessao BullEx desconectada. Reconecte sua conta."
          ? null
          : current,
      );
    }
  }, [socketStatus]);

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
      priceFormat: buildPriceFormat(selectedSymbol, lastPrice),
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
      priceFormat: buildPriceFormat(selectedSymbol, lastPrice),
    });
    if (candles.length > 0) {
      series.setData(candles);
    } else {
      series.setData([]);
    }
    chart.priceScale("right").applyOptions({
      autoScale: true,
      borderVisible: false,
      visible: true,
    });

    const symbolChanged = prevSymbolRef.current !== selectedSymbol;
    console.log("[CHART UPDATE]", { symbol: selectedSymbol, candles: candles.length, symbolChanged });

    if (symbolChanged) {
      chart.timeScale().fitContent();
      prevSymbolRef.current = selectedSymbol;
    } else if (followPrice && candles.length > 0) {
      chart.timeScale().scrollToRealTime();
      console.log("[CHART FOLLOW PRICE]", { symbol: selectedSymbol, enabled: true });
    }
  }, [candles, followPrice, lastPrice, selectedSymbol]);

  const sessionMissing =
    isSessionMissing(account.error) ||
    isSessionMissing(assetsQuery.error) ||
    isSessionMissing(candlesError) ||
    isSessionMissing(payoutError);

  const displayedCandle = hoveredCandle ?? candles[candles.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Grafico em tempo real</h1>
        <p className="text-sm text-muted-foreground">
          Selecione um ativo para acompanhar os candles retornados pela BullEx.
        </p>
      </header>

      {sessionMissing && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          Conecte sua conta BullEx primeiro
        </div>
      )}

      {assetsQuery.error && !isSessionMissing(assetsQuery.error) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {assetsQuery.error instanceof Error ? assetsQuery.error.message : "Erro ao carregar ativos"}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Ativo
            </label>
            <select
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              disabled={assetsQuery.isLoading || tradableAssets.length === 0}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            >
              <option value="">
                {assetsQuery.isLoading
                  ? "Carregando ativos..."
                  : tradableAssets.length === 0
                    ? "Nenhum ativo recebido da API"
                    : "Selecione um ativo"}
              </option>
              {tradableAssets.map((asset) => (
                <option key={`${asset.symbol}-${asset.active_id}`} value={asset.symbol}>
                  {`${asset.symbol} | ID ${asset.active_id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <BadgeLabel label="Payout" value={isPayoutLoading ? "..." : formatPayoutValue(selectedPayout)} />
            <BadgeLabel label="Modo" value={account.data?.mode ?? "-"} />
            <BadgeLabel label="Ultimo preco" value={lastPrice != null ? formatNumber(lastPrice) : "-"} />
            <BadgeLabel label="Atualizado" value={lastUpdated ? formatDateTime(lastUpdated) : "-"} />
            <BadgeLabel label="WebSocket" value={formatSocketStatus(socketStatus)} />
          </div>
        </div>

        {!assetsQuery.isLoading && tradableAssets.length === 0 && (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Nenhum ativo recebido da API
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">{selected ? selected.symbol : "Selecione um ativo"}</h2>
            <p className="text-xs text-muted-foreground">
              Intervalo 60s, ultimos 100 candles. Atualiza a cada 5 segundos.
            </p>
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
                  console.log("[CHART FOLLOW PRICE]", { symbol: selectedSymbol, enabled: next });
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

        {candlesError && !isSessionMissing(candlesError) && (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {candlesError instanceof Error ? candlesError.message : "Erro ao carregar candles"}
          </div>
        )}

        {socketMessage && socketMessage !== "SESSION_DISCONNECTED" && (
          <div className="mx-5 mt-5 rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            {socketMessage}
          </div>
        )}

        <div className="relative h-[520px] min-h-[520px] p-4">
          <div
            ref={chartContainerRef}
            className="h-[520px] w-full overflow-hidden rounded-xl border border-border/60 bg-card"
          />

          {displayedCandle && (
            <div className="pointer-events-none absolute right-8 top-8 rounded-lg border border-border/80 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <div className="font-semibold text-foreground">{formatTime(displayedCandle.time)}</div>
              <div className="mt-1 text-muted-foreground">Open {formatNumber(displayedCandle.open)}</div>
              <div className="text-muted-foreground">High {formatNumber(displayedCandle.high)}</div>
              <div className="text-muted-foreground">Low {formatNumber(displayedCandle.low)}</div>
              <div className="text-muted-foreground">Close {formatNumber(displayedCandle.close)}</div>
            </div>
          )}

          {selectedSymbol && !isCandlesLoading && candles.length === 0 && !candlesError && (
            <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum candle normalizado retornado
            </div>
          )}

          {!selectedSymbol && (
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
              {selectedSymbol && !isCandlesLoading && candles.length === 0 && !candlesError && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={5}>
                    Nenhum candle normalizado retornado
                  </td>
                </tr>
              )}
              {!selectedSymbol && (
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

function isSessionMissing(error: unknown) {
  return error instanceof ApiError && error.code === "SESSION_NOT_FOUND";
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

  return {
    symbol,
    active_id: String(value.active_id ?? value.activeId ?? value.id ?? value.active ?? symbol),
    enabled: Boolean(value.enabled ?? value.is_enabled ?? value.open ?? value.status === "enabled"),
  };
}

function normalizePayout(active: string, input: unknown): Payout {
  if (!Array.isArray(input)) {
    console.error("[bullex/chart] Unexpected payouts payload", { active, payload: input });
    return { active, payout: null };
  }

  const value = input[0];
  if (!value || typeof value !== "object") return { active, payout: null };

  const row = value as Record<string, unknown>;
  const raw = row.payout;
  const payout = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(payout)) {
    console.error("[bullex/chart] Unexpected payout row", { active, row });
    return { active, payout: null };
  }

  return { active, payout };
}

function normalizeCandlesPayload(active: string, input: unknown): Candle[] {
  const raw = getRawCandles(input);

  if (raw.length === 0) {
    if (input == null || (typeof input !== "object" && !Array.isArray(input))) {
      console.error("[bullex/chart] Unexpected candles payload", { active, payload: input });
    }
    return [];
  }

  const normalized = raw.map((item) => normalizeCandle(active, item)).filter(Boolean) as Candle[];
  normalized.sort((a, b) => Number(a.time) - Number(b.time));

  return normalized.filter((candle, index, array) => {
    const previous = array[index - 1];
    return !previous || Number(previous.time) !== Number(candle.time);
  });
}

function normalizeCandle(active: string, item: unknown): Candle | null {
  if (!item || typeof item !== "object") {
    console.error("[bullex/chart] Invalid candle item", { active, candle: item });
    return null;
  }

  const value = item as Record<string, unknown>;
  const open = Number(value.open);
  const high = Number(value.max ?? value.high);
  const low = Number(value.min ?? value.low);
  const close = Number(value.close);
  const rawTime = Math.floor(Number(value.from));

  if (![open, high, low, close, rawTime].every(Number.isFinite)) {
    console.error("[bullex/chart] Unexpected candle shape", { active, candle: item });
    return null;
  }

  return {
    time: rawTime as UTCTimestamp,
    open,
    high,
    low,
    close,
  };
}

function getRawCandles(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];

  const value = input as Record<string, unknown>;
  if (Array.isArray(value.data)) return value.data;

  const data = value.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (Array.isArray(nested.candles)) return nested.candles;
  }

  if (Array.isArray(value.candles)) return value.candles;
  return [];
}

function buildPriceFormat(symbol: string, lastPrice: number | null) {
  if (symbol.includes("EUR") || symbol.includes("GBP") || symbol.includes("AUD") || symbol.includes("NZD")) {
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

function normalizeSocketCandle(message: MarketSocketCandleMessage): Candle | null {
  const time = Math.floor(Number(message.time));
  const open = Number(message.open);
  const high = Number(message.high);
  const low = Number(message.low);
  const close = Number(message.close);

  if (![time, open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return {
    time: time as UTCTimestamp,
    open,
    high,
    low,
    close,
  };
}

function mergeRealtimeCandle(current: Candle[], nextCandle: Candle) {
  const next = [...current];
  const existingIndex = next.findIndex((candle) => Number(candle.time) === Number(nextCandle.time));

  if (existingIndex >= 0) {
    next[existingIndex] = nextCandle;
  } else {
    next.push(nextCandle);
  }

  next.sort((a, b) => Number(a.time) - Number(b.time));
  return next.slice(-200);
}

function formatSocketStatus(status: MarketSocketStatus) {
  switch (status) {
    case "connected":
      return "WS conectado";
    case "reconnecting":
      return "WS reconectando";
    case "connecting":
      return "WS conectando";
    case "error":
      return "WS erro";
    default:
      return "WS desconectado";
  }
}

function formatPayoutValue(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value}%`;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(value);
}
