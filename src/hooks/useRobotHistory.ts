import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export type RobotHistoryDays = 1 | 7 | 30;
export const ROBOT_HISTORY_QUERY_KEY = ["robot-history"] as const;
export const ROBOT_STATS_QUERY_KEY = ["robot-stats"] as const;

export type RobotHistoryItem = {
  id: string;
  createdAt: string | null;
  accountMode: "REAL" | null;
  active: string;
  direction: "CALL" | "PUT";
  amount: number;
  confidence: number | null;
  payout: number | null;
  orderId: string | null;
  result: "WIN" | "LOSS";
  badge: "NORMAL" | "GALE 1" | "GALE WIN" | "GALE LOSS";
  isGale: boolean;
  galeStep: number | null;
  profit: number;
  openedAt: string | null;
  finishedAt: string | null;
  timeframe: string | null;
};

export type RobotStats = {
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  profit: number;
  profitFactor: number | null;
  currentWinStreak: number;
  currentLossStreak: number;
  bestWinStreak: number;
  bestLossStreak: number;
};

const EMPTY_STATS: RobotStats = {
  wins: 0,
  losses: 0,
  totalTrades: 0,
  winRate: 0,
  profit: 0,
  profitFactor: null,
  currentWinStreak: 0,
  currentLossStreak: 0,
  bestWinStreak: 0,
  bestLossStreak: 0,
};

export function useRobotHistory(days: RobotHistoryDays) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...ROBOT_HISTORY_QUERY_KEY, user?.id, days],
    queryFn: async () => {
      const response = await apiRequest<unknown>(`/robot/history?days=${days}`);
      if (!response.ok) throw new ApiError(response.error, response.code);
      return normalizeHistory(response.data);
    },
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 0,
  });
}

export function useRobotStats(days: RobotHistoryDays) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...ROBOT_STATS_QUERY_KEY, user?.id, days],
    queryFn: async () => {
      const response = await apiRequest<unknown>(`/robot/stats?days=${days}`);
      if (!response.ok) throw new ApiError(response.error, response.code);
      return normalizeStats(response.data);
    },
    enabled: Boolean(user?.id),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 15000,
  });
}

function normalizeHistory(input: unknown): RobotHistoryItem[] {
  const payload = unwrapHistoryPayload(input);
  const items = extractHistoryItems(payload, input);

  return items.map(normalizeHistoryItem).filter(Boolean) as RobotHistoryItem[];
}

function normalizeHistoryItem(input: unknown): RobotHistoryItem | null {
  const value = asRecord(input);
  const active = text(value.active ?? value.symbol);
  const direction = text(value.direction ?? value.signal).toUpperCase();
  const result = normalizeHistoryResult(
    value.result ??
      value.cycle_result ??
      value.cycleResult ??
      value.outcome ??
      value.trade_result ??
      value.tradeResult ??
      value.status,
  );

  if (!active || (direction !== "CALL" && direction !== "PUT")) return null;
  if (!result) return null;

  return {
    id: text(value.id) || `${active}:${text(value.finished_at ?? value.finishedAt)}`,
    createdAt: optionalText(value.created_at ?? value.createdAt),
    accountMode: normalizeAccountMode(value.account_mode ?? value.accountMode),
    active,
    direction,
    amount: number(value.amount ?? value.entry_value ?? value.entryValue ?? value.value) ?? 0,
    confidence: percentage(value.confidence),
    payout: percentage(value.payout),
    orderId: optionalText(value.order_id ?? value.orderId),
    result,
    badge: normalizeBadge(value),
    isGale: normalizeIsGale(value),
    galeStep: number(
      value.gale_step ?? value.galeStep ?? value.martingale_step ?? value.martingaleStep,
    ),
    profit: number(value.profit ?? value.pnl ?? value.result_amount ?? value.resultAmount) ?? 0,
    openedAt: optionalText(value.opened_at ?? value.openedAt ?? value.sent_at ?? value.sentAt),
    finishedAt: optionalText(
      value.finished_at ?? value.finishedAt ?? value.closed_at ?? value.closedAt,
    ),
    timeframe: optionalText(value.timeframe ?? value.expiration ?? value.expiration_type),
  };
}

function normalizeBadge(value: Record<string, unknown>): RobotHistoryItem["badge"] {
  const cycleResult = text(value.cycle_result ?? value.cycleResult).toUpperCase();
  if (cycleResult === "GALE_WIN") return "GALE WIN";
  if (cycleResult === "GALE_LOSS") return "GALE LOSS";

  const tradeType = text(value.trade_type ?? value.tradeType ?? value.badge).toUpperCase();
  if (tradeType === "GALE_WIN") return "GALE WIN";
  if (tradeType === "GALE_LOSS") return "GALE LOSS";
  if (tradeType === "GALE 1" || tradeType === "GALE_1") return "GALE 1";

  const galeStep = number(
    value.gale_step ?? value.galeStep ?? value.martingale_step ?? value.martingaleStep,
  );
  return galeStep != null && galeStep >= 1 ? "GALE 1" : "NORMAL";
}

function normalizeIsGale(value: Record<string, unknown>) {
  const isGale = boolean(value.is_gale ?? value.isGale ?? value.gale ?? value.martingale);
  if (isGale != null) return isGale;
  return (
    number(value.gale_step ?? value.galeStep ?? value.martingale_step ?? value.martingaleStep) != null
  );
}

function normalizeStats(input: unknown): RobotStats {
  const value = unwrapStatsPayload(input);
  return {
    wins: nonNegative(value.wins ?? value.won ?? value.win_count ?? value.winCount),
    losses: nonNegative(value.losses ?? value.loss_count ?? value.lossCount),
    totalTrades: nonNegative(
      value.total_trades ?? value.totalTrades ?? value.total ?? value.trades ?? value.operations,
    ),
    winRate: percentage(value.win_rate ?? value.winRate ?? value.assertiveness ?? value.hit_rate) ?? 0,
    profit: number(value.profit ?? value.pnl ?? value.total_profit ?? value.totalProfit) ?? 0,
    profitFactor: finiteOrNull(
      value.profit_factor ?? value.profitFactor ?? value.factor ?? value.payoff,
    ),
    currentWinStreak: nonNegative(value.current_win_streak ?? value.currentWinStreak),
    currentLossStreak: nonNegative(value.current_loss_streak ?? value.currentLossStreak),
    bestWinStreak: nonNegative(value.best_win_streak ?? value.bestWinStreak),
    bestLossStreak: nonNegative(value.best_loss_streak ?? value.bestLossStreak),
  };
}

export function getEmptyRobotStats() {
  return EMPTY_STATS;
}

function unwrapHistoryPayload(input: unknown): Record<string, unknown> {
  let value = asRecord(input);

  for (let depth = 0; depth < 3; depth += 1) {
    if (
      Array.isArray(value.items) ||
      Array.isArray(value.history) ||
      Array.isArray(value.trades) ||
      Array.isArray(value.operations) ||
      Array.isArray(value.records)
    ) {
      return value;
    }

    const nested = value.data ?? value.result ?? value.payload;
    const nextValue = asRecord(nested);
    if (Object.keys(nextValue).length === 0) break;
    value = nextValue;
  }

  return value;
}

function extractHistoryItems(payload: Record<string, unknown>, originalInput: unknown) {
  if (Array.isArray(originalInput)) return originalInput;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.history)) return payload.history;
  if (Array.isArray(payload.trades)) return payload.trades;
  if (Array.isArray(payload.operations)) return payload.operations;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function unwrapStatsPayload(input: unknown): Record<string, unknown> {
  let value = asRecord(input);

  for (let depth = 0; depth < 3; depth += 1) {
    if (
      "wins" in value ||
      "losses" in value ||
      "total_trades" in value ||
      "totalTrades" in value ||
      "profit" in value
    ) {
      return value;
    }

    const nested = value.stats ?? value.data ?? value.result ?? value.summary ?? value.overview;
    const nextValue = asRecord(nested);
    if (Object.keys(nextValue).length === 0) break;
    value = nextValue;
  }

  return value;
}

function normalizeHistoryResult(input: unknown): RobotHistoryItem["result"] | null {
  const value = text(input).toUpperCase();
  if (value === "WIN" || value === "GALE_WIN" || value === "WON") return "WIN";
  if (value === "LOSS" || value === "GALE_LOSS" || value === "LOST") return "LOSS";
  return null;
}

function normalizeAccountMode(input: unknown): "REAL" | null {
  return input == null ? null : "REAL";
}

function percentage(input: unknown) {
  const value = number(input);
  if (value == null) return null;
  return value >= 0 && value <= 1 ? value * 100 : value;
}

function finiteOrNull(input: unknown) {
  const value = number(input);
  return value != null && Number.isFinite(value) ? value : null;
}

function nonNegative(input: unknown) {
  return Math.max(0, Math.trunc(number(input) ?? 0));
}

function number(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const parsed = Number(input.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(input: unknown) {
  const value = text(input);
  return value || null;
}

function boolean(input: unknown) {
  if (input === true || input === 1) return true;
  if (input === false || input === 0) return false;
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "nao") {
    return false;
  }
  return null;
}

function text(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return typeof input === "string" ? input.trim() : "";
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
