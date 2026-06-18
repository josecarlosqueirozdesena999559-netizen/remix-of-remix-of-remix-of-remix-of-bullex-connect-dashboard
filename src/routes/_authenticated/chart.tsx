import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { BarChart3, Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useRobotDisplayState } from "@/hooks/useRobotDisplayState";
import { useMarketData } from "@/hooks/useMarketData";
import { useRobotState, type RobotState } from "@/hooks/useRobotState";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

const TradingChart = lazy(() =>
  import("@/components/TradingChart").then((module) => ({ default: module.TradingChart })),
);

export const Route = createFileRoute("/_authenticated/chart")({
  ssr: false,
  head: () => ({ meta: [{ title: "Gráfico em tempo real - BullEx AutoBot" }] }),
  component: MarketPage,
});

type Asset = {
  symbol: string;
  active_id: string | number;
  enabled: boolean;
  payout: number | null;
};

const EMPTY_ASSETS: Asset[] = [];
const DEFAULT_SYMBOL = "EURUSD-OTC";
const DEFAULT_TIMEFRAME = "M1";
const CHART_TIME_ZONE = "America/Fortaleza";

function MarketPage() {
  const { user } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const account = useBullExAccount();
  const robotState = useRobotState(user?.id);
  const displayRobotState = useRobotDisplayState(robotState.data);
  const now = useCurrentTime();
  const chartSelection = resolveChartSelection(displayRobotState, selectedSymbol, now);
  const chartSymbol = chartSelection.symbol;

  const assetsQuery = useQuery({
    queryKey: ["bullex", user?.id, "assets"],
    queryFn: async () => {
      const assetsResponse = await apiRequest<unknown>("/bullex/assets");
      return normalizeAssetsPayload(unwrap(assetsResponse))
        .map(normalizeAsset)
        .filter(Boolean) as Asset[];
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
  } = useMarketData(chartSymbol || null, DEFAULT_TIMEFRAME);

  const realtimeAgeSeconds =
    lastCandleReceivedAt == null
      ? null
      : Math.max(0, Math.floor((now - lastCandleReceivedAt.getTime()) / 1000));
  const realtimeStatus =
    realtimeAgeSeconds == null ? "Atrasado" : realtimeAgeSeconds <= 3 ? "Tempo real" : "Atrasado";

  const lastRealtimeStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chartSymbol || realtimeAgeSeconds == null) return;
    const realtimeKey = `${chartSymbol}|${realtimeStatus}`;
    if (lastRealtimeStatusRef.current === realtimeKey) return;
    lastRealtimeStatusRef.current = realtimeKey;

    const payload = { symbol: chartSymbol, age_seconds: realtimeAgeSeconds };
    if (realtimeStatus === "Tempo real") {
      console.log("[CHART_REALTIME_OK]", payload);
    } else {
      console.log("[CHART_REALTIME_STALE]", payload);
    }
  }, [chartSymbol, realtimeAgeSeconds, realtimeStatus]);

  useEffect(() => {
    if (assets.length === 0) return;
    if (chartSelection.source !== "selected") return;
    if (assets.some((asset) => asset.symbol === selectedSymbol)) return;

    const defaultAsset = assets.find((asset) => asset.symbol === DEFAULT_SYMBOL) ?? assets[0];
    if (defaultAsset?.symbol) {
      setSelectedSymbol(defaultAsset.symbol);
    }
  }, [assets, chartSelection.source, selectedSymbol]);

  const sessionMissing =
    isSessionError(account.error) ||
    isSessionError(assetsQuery.error) ||
    isSessionError(candlesError) ||
    isSessionError(payoutError);

  const assetNotAllowedError =
    isAssetNotAllowed(assetsQuery.error) ||
    isAssetNotAllowed(candlesError) ||
    isAssetNotAllowed(payoutError);

  const overlaySignal = displayRobotState?.pending_signal ?? displayRobotState?.best_candidate ?? null;
  const overlayResult = getOverlayResult(displayRobotState);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mercado binário - 21 pares monitorados</h1>
        <p className="text-sm text-muted-foreground">
          Gráfico próprio usando apenas os candles retornados pela BullEx.
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

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Ativo
            </label>
            <select
              value={chartSymbol}
              onChange={(event) => {
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
              {chartSelection.source !== "selected" &&
              !assets.some((asset) => asset.symbol === chartSymbol) ? (
                <option value={chartSymbol}>
                  {`${chartSymbol} | ${formatChartSource(chartSelection.source)}`}
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
            <BadgeLabel label="Fonte" value={formatChartSource(chartSelection.source)} />
            <BadgeLabel
              label="Tempo real"
              value={formatRealtimeStatus(realtimeStatus, realtimeAgeSeconds)}
            />
            <BadgeLabel
              label="Payout"
              value={isPayoutLoading ? "..." : formatPayoutValue(selectedPayout)}
            />
            <BadgeLabel label="Modo" value={formatAccountMode(account.data?.mode)} />
            <BadgeLabel
              label="Último preço"
              value={lastPrice != null ? formatNumber(lastPrice) : "-"}
            />
            <BadgeLabel
              label="Último candle"
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

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">
              {selected?.symbol ?? chartSymbol ?? "Selecione um ativo"}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Timeframe {DEFAULT_TIMEFRAME}
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

        <ClientOnly
          fallback={
            <div className="p-4">
              <div className="flex h-[560px] w-full items-center justify-center rounded-xl border border-border/60 bg-card text-sm text-muted-foreground md:h-[680px]">
                Carregando gráfico...
              </div>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="p-4">
                <div className="flex h-[560px] w-full items-center justify-center rounded-xl border border-border/60 bg-card text-sm text-muted-foreground md:h-[680px]">
                  Carregando gráfico...
                </div>
              </div>
            }
          >
            <TradingChart
              symbol={chartSymbol || DEFAULT_SYMBOL}
              timeframe={DEFAULT_TIMEFRAME}
              candles={candles}
              overlay={{
                currentPrice: lastPrice,
                realtimeStatus: formatRealtimeStatus(realtimeStatus, realtimeAgeSeconds),
                bestSymbol: displayRobotState?.best_candidate?.symbol ?? null,
                direction: overlaySignal?.direction ?? null,
                confidence: overlaySignal?.confidence ?? null,
                score: overlaySignal?.strategy_score ?? null,
                strategy: overlaySignal?.strategy_name ?? null,
                entryCountdown: formatEntryCountdown(displayRobotState),
                result: overlayResult,
              }}
            />
          </Suspense>
        </ClientOnly>

        {chartSymbol && !isCandlesLoading && candles.length === 0 && !candlesError && (
          <div className="pb-5 text-center text-sm text-muted-foreground">
            Nenhum candle normalizado retornado
          </div>
        )}

        {!chartSymbol && (
          <div className="pb-5 text-center text-sm text-muted-foreground">
            Selecione um ativo para abrir o gráfico.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">Últimos 10 candles</h2>
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

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function resolveChartSelection(
  robotState: RobotState | undefined,
  selectedSymbol: string,
  now: number,
) {
  if (robotState?.pending_signal?.symbol) {
    return { symbol: robotState.pending_signal.symbol, source: "pending_signal" as const };
  }

  if (robotState?.best_candidate?.symbol) {
    return { symbol: robotState.best_candidate.symbol, source: "best_candidate" as const };
  }

  if (robotState?.last_trade && isRecentTrade(robotState.last_trade, now)) {
    return { symbol: robotState.last_trade.active, source: "last_trade" as const };
  }

  return { symbol: selectedSymbol || DEFAULT_SYMBOL, source: "selected" as const };
}

function isRecentTrade(trade: NonNullable<RobotState["last_trade"]>, now: number) {
  const timestamp = parseTimestamp(trade.finished_at ?? trade.sent_at);
  if (timestamp == null) return false;
  const ageSeconds = (now - timestamp) / 1000;
  return ageSeconds >= 0 && ageSeconds < 60;
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const timestamp = Date.parse(hasTimezone ? value : `${value}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatChartSource(source: ReturnType<typeof resolveChartSelection>["source"]) {
  switch (source) {
    case "pending_signal":
      return "Sinal pendente";
    case "best_candidate":
      return "Melhor ativo";
    case "last_trade":
      return "Última entrada";
    default:
      return "Selecionado";
  }
}

function formatRealtimeStatus(status: string, ageSeconds: number | null) {
  return ageSeconds == null ? status : `${status} (${ageSeconds}s)`;
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
    timeZone: CHART_TIME_ZONE,
  }).format(date);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: CHART_TIME_ZONE,
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

function formatEntryCountdown(robotState: RobotState | undefined) {
  const seconds =
    robotState?.status === "WAITING_NEXT_CANDLE_ENTRY"
      ? robotState.seconds_until_entry ?? robotState.seconds_until_entry_window
      : robotState?.display_countdown_seconds ?? robotState?.seconds_until_entry_window ?? null;
  if (seconds == null) return null;

  if (robotState?.status === "WAITING_NEXT_CANDLE_ENTRY" && seconds <= 0) {
    return "Aguardando abertura da vela...";
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getOverlayResult(robotState: RobotState | undefined) {
  if (!robotState) return null;
  if (robotState.cycle_result === "WIN" || robotState.cycle_result === "LOSS") {
    return robotState.cycle_result;
  }
  if (robotState.cycle_result === "GALE_WIN") return "WIN";
  if (robotState.cycle_result === "GALE_LOSS") return "LOSS";
  if (robotState.gale_pending || robotState.gale_in_progress) return null;
  if (robotState.last_trade?.result === "WIN" || robotState.last_trade?.result === "LOSS") {
    return robotState.last_trade.result;
  }
  return null;
}
