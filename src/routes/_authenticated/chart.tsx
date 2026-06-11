import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";
import { useBullexAccount } from "@/lib/useBullex";

export const Route = createFileRoute("/_authenticated/chart")({
  head: () => ({ meta: [{ title: "Gráfico em tempo real - BullEx AutoBot" }] }),
  component: MarketPage,
});

type Asset = {
  symbol: string;
  activeId: string | number;
  enabled: boolean;
};

type Candle = {
  time: string | number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Payout = {
  active: string;
  payout: number | null;
};

function MarketPage() {
  const [selectedAsset, setSelectedAsset] = useState("");
  const account = useBullexAccount();

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
      normalizeCollection(
        unwrap(
          await apiRequest<unknown>(
            `/bullex/candles?active=${encodeURIComponent(selectedAsset)}&interval=60&count=100`,
          ),
        ),
      )
        .map(normalizeCandle)
        .filter(Boolean) as Candle[],
    enabled: !!selectedAsset,
    refetchInterval: selectedAsset ? 5000 : false,
    retry: 1,
    staleTime: 0,
  });

  const candles = candlesQuery.data ?? [];
  const chartData = candles.map((candle) => ({
    ...candle,
    timeLabel: formatTime(candle.time),
  }));
  const lastCandle = candles[candles.length - 1];
  const lastUpdated = candlesQuery.dataUpdatedAt ? new Date(candlesQuery.dataUpdatedAt) : null;

  const sessionMissing =
    isSessionMissing(account.error) ||
    isSessionMissing(assetsQuery.error) ||
    isSessionMissing(candlesQuery.error) ||
    payouts.some((query) => isSessionMissing(query.error));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gráfico em tempo real</h1>
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

      <section className="rounded-2xl bg-card border border-border p-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Ativo
            </label>
            <select
              value={selectedAsset}
              onChange={(event) => setSelectedAsset(event.target.value)}
              disabled={assetsQuery.isLoading || assets.length === 0}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
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
            <BadgeLabel label="Último close" value={lastCandle ? formatNumber(lastCandle.close) : "-"} />
            <BadgeLabel label="Atualizado" value={lastUpdated ? formatDateTime(lastUpdated) : "-"} />
          </div>
        </div>

        {!assetsQuery.isLoading && assets.length === 0 && (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Nenhum ativo retornado pela BullEx
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <div>
            <h2 className="font-semibold">{selected ? selected.symbol : "Selecione um ativo"}</h2>
            <p className="text-xs text-muted-foreground">
              Intervalo 60s, últimos 100 candles. Atualiza a cada 5 segundos.
            </p>
          </div>
          {candlesQuery.isFetching ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <BarChart3 className="w-4 h-4 text-primary" />}
        </div>

        {candlesQuery.error && !isSessionMissing(candlesQuery.error) && (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {candlesQuery.error instanceof Error ? candlesQuery.error.message : "Erro ao carregar candles"}
          </div>
        )}

        <div className="h-[360px] p-4">
          {selectedAsset && candles.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="timeLabel" minTickGap={28} tick={{ fontSize: 12 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} width={70} />
                <Tooltip
                  formatter={(value) => [formatNumber(Number(value)), "Close"]}
                  labelFormatter={(label) => `Hora: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {selectedAsset && !candlesQuery.isFetching && candles.length === 0 && !candlesQuery.error && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Nenhum candle retornado
            </div>
          )}

          {!selectedAsset && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Selecione um ativo para abrir o gráfico.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold">Últimos 10 candles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
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
    if (Array.isArray(value.candles)) return value.candles;
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
  const value = Array.isArray(input) ? input.find((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return [row.symbol, row.active, row.asset, row.name].map(String).includes(active);
  }) : input;

  if (!value || typeof value !== "object") return { active, payout: null };
  const row = value as Record<string, unknown>;
  const raw = row.payout ?? row.percent ?? row.value ?? row.profit;
  const payout = typeof raw === "number" ? raw : Number(raw);
  return { active, payout: Number.isFinite(payout) ? payout : null };
}

function normalizeCandle(item: unknown): Candle | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  const open = Number(value.open);
  const high = Number(value.max);
  const low = Number(value.min);
  const close = Number(value.close);
  const time = value.from;

  if (![open, high, low, close].every(Number.isFinite) || time == null) return null;
  return { time: time as string | number | Date, open, high, low, close };
}

function formatPayoutValue(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value}%`;
}

function formatTime(value: string | number | Date) {
  const date = typeof value === "number" && value < 10_000_000_000 ? new Date(value * 1000) : new Date(value);
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
