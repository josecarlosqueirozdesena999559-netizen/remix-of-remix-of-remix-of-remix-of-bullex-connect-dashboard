import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, createChart, type CandlestickData, type UTCTimestamp } from "lightweight-charts";
import { BarChart3, Loader2 } from "lucide-react";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";
import { useBullexAccount } from "@/lib/useBullex";

export const Route = createFileRoute("/_authenticated/chart")({
  head: () => ({ meta: [{ title: "Grafico em tempo real - BullEx AutoBot" }] }),
  component: MarketPage,
});

type Asset = {
  symbol: string;
  activeId: string | number;
  enabled: boolean;
};

type Candle = CandlestickData<UTCTimestamp>;

type Payout = {
  active: string;
  payout: number | null;
};

function MarketPage() {
  const [selectedAsset, setSelectedAsset] = useState("");
  const account = useBullexAccount();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["bullex", "assets"],
    queryFn: async () =>
      normalizeCollection(unwrap(await apiRequest<unknown>("/bullex/assets")))
        .map(normalizeAsset)
        .filter(Boolean) as Asset[],
    retry: 1,
    staleTime: 30000,
  });

  const assets = assetsQuery.data ?? [];
  const payouts = useQueries({
    queries: assets.map((asset) => ({
      queryKey: ["bullex", "payouts", asset.symbol],
      queryFn: async () =>
        normalizePayout(
          asset.symbol,
          unwrap(await apiRequest<unknown>(`/bullex/payouts?active=${encodeURIComponent(asset.symbol)}`)),
        ),
      enabled: assetsQuery.isSuccess,
      retry: 1,
      staleTime: 15000,
    })),
  });

  const payoutsBySymbol = useMemo(() => {
    const map = new Map<string, Payout>();
    payouts.forEach((query) => {
      if (query.data) map.set(query.data.active, query.data);
    });
    return map;
  }, [payouts]);

  const selected = assets.find((asset) => asset.symbol === selectedAsset) ?? null;
  const selectedPayout = selected ? payoutsBySymbol.get(selected.symbol)?.payout ?? null : null;

  const candlesQuery = useQuery({
    queryKey: ["bullex", "candles", selectedAsset],
    queryFn: async () =>
      normalizeCandlesPayload(
        selectedAsset,
        unwrap(
          await apiRequest<unknown>(
            `/bullex/candles?active=${encodeURIComponent(selectedAsset)}&interval=60&count=100`,
          ),
        ),
      ),
    enabled: !!selectedAsset,
    refetchInterval: selectedAsset ? 5000 : false,
    retry: 1,
    staleTime: 0,
  });

  const candles = candlesQuery.data ?? [];
  const lastCandle = candles[candles.length - 1];
  const lastUpdated = candlesQuery.dataUpdatedAt ? new Date(candlesQuery.dataUpdatedAt) : null;

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    if (!selectedAsset || candles.length === 0) {
      container.replaceChildren();
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 328,
      layout: {
        background: { color: getCssVar("--card", "#242424") },
        textColor: getCssVar("--muted-foreground", "#a0a0a0"),
      },
      grid: {
        vertLines: { color: withOpacity(getCssVar("--border", "#333333"), 0.45) },
        horzLines: { color: withOpacity(getCssVar("--border", "#333333"), 0.45) },
      },
      crosshair: {
        vertLine: { color: withOpacity(getCssVar("--primary", "#94d13d"), 0.35) },
        horzLine: { color: withOpacity(getCssVar("--primary", "#94d13d"), 0.35) },
      },
      rightPriceScale: {
        borderColor: getCssVar("--border", "#333333"),
      },
      timeScale: {
        borderColor: getCssVar("--border", "#333333"),
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineColor: getCssVar("--primary", "#94d13d"),
      lastValueVisible: true,
    });

    series.setData(candles);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height || 328),
      });
      chart.timeScale().fitContent();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, selectedAsset]);

  const sessionMissing =
    isSessionMissing(account.error) ||
    isSessionMissing(assetsQuery.error) ||
    isSessionMissing(candlesQuery.error) ||
    payouts.some((query) => isSessionMissing(query.error));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Grafico em tempo real</h1>
        <p className="text-sm text-muted-foreground">Selecione um ativo para acompanhar os candles retornados pela BullEx.</p>
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
              value={selectedAsset}
              onChange={(event) => setSelectedAsset(event.target.value)}
              disabled={assetsQuery.isLoading || assets.length === 0}
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            >
              <option value="">
                {assetsQuery.isLoading ? "Carregando ativos..." : "Selecione um ativo"}
              </option>
              {assets.map((asset) => (
                <option key={`${asset.symbol}-${asset.activeId}`} value={asset.symbol}>
                  {asset.symbol} | ID {asset.activeId} | Payout {formatPayoutValue(payoutsBySymbol.get(asset.symbol)?.payout)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <BadgeLabel label="Payout" value={formatPayoutValue(selectedPayout)} />
            <BadgeLabel label="Modo" value={account.data?.mode ?? "-"} />
            <BadgeLabel label="Ultimo preco" value={lastCandle ? formatNumber(lastCandle.close) : "-"} />
            <BadgeLabel label="Atualizado" value={lastUpdated ? formatDateTime(lastUpdated) : "-"} />
          </div>
        </div>

        {!assetsQuery.isLoading && assets.length === 0 && (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Nenhum ativo retornado pela BullEx
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">{selected ? selected.symbol : "Selecione um ativo"}</h2>
            <p className="text-xs text-muted-foreground">
              Intervalo 60s, ultimos 100 candles. Atualiza a cada 5 segundos.
            </p>
          </div>
          {candlesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <BarChart3 className="h-4 w-4 text-primary" />}
        </div>

        {candlesQuery.error && !isSessionMissing(candlesQuery.error) && (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {candlesQuery.error instanceof Error ? candlesQuery.error.message : "Erro ao carregar candles"}
          </div>
        )}

        <div className="h-[360px] p-4">
          <div ref={chartContainerRef} className="h-full w-full overflow-hidden rounded-xl border border-border/60 bg-card" />

          {selectedAsset && !candlesQuery.isFetching && candles.length === 0 && !candlesQuery.error && (
            <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum candle retornado
            </div>
          )}

          {!selectedAsset && (
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
              {selectedAsset && !candlesQuery.isFetching && candles.length === 0 && !candlesQuery.error && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={5}>
                    Nenhum candle retornado
                  </td>
                </tr>
              )}
              {!selectedAsset && (
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

function normalizeAsset(item: unknown): Asset | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const symbol = String(value.symbol ?? value.active ?? value.name ?? value.asset ?? "");
  if (!symbol) return null;

  return {
    symbol,
    activeId: String(value.active_id ?? value.activeId ?? value.id ?? value.active ?? symbol),
    enabled: Boolean(value.enabled ?? value.is_enabled ?? value.open ?? value.status === "enabled"),
  };
}

function normalizePayout(active: string, input: unknown): Payout {
  if (!Array.isArray(input)) {
    console.error("[bullex/chart] Unexpected payouts payload", { active, payload: input });
    return { active, payout: null };
  }

  const value = input.find((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return [row.symbol, row.active, row.asset, row.name].map((field) => String(field ?? "")).includes(active);
  });

  if (!value || typeof value !== "object") {
    return { active, payout: null };
  }

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
  if (!input || typeof input !== "object") {
    console.error("[bullex/chart] Unexpected candles payload", { active, payload: input });
    return [];
  }

  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.candles)) {
    console.error("[bullex/chart] Missing candles array", { active, payload: input });
    return [];
  }

  return value.candles.map((item) => normalizeCandle(active, item)).filter(Boolean) as Candle[];
}

function normalizeCandle(active: string, item: unknown): Candle | null {
  if (!item || typeof item !== "object") {
    console.error("[bullex/chart] Invalid candle item", { active, candle: item });
    return null;
  }

  const value = item as Record<string, unknown>;
  const open = Number(value.open);
  const high = Number(value.max);
  const low = Number(value.min);
  const close = Number(value.close);
  const rawTime = typeof value.from === "number" ? value.from : Number(value.from);

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

function getCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withOpacity(color: string, opacity: number) {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");
    return `${hex}${alpha}`;
  }

  return color;
}
