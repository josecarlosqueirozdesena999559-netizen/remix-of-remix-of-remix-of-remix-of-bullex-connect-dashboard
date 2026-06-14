import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export type RobotHistoryDays = 1 | 7 | 30;

export type RobotHistoryItem = {
  id: string;
  createdAt: string | null;
  accountMode: "DEMO" | "REAL" | null;
  active: string;
  direction: "CALL" | "PUT";
  amount: number;
  confidence: number | null;
  payout: number | null;
  orderId: string | null;
  result: "WIN" | "LOSS";
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
    queryKey: ["robot-history", user?.id, days],
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
    staleTime: 15000,
  });
}

export function useRobotStats(days: RobotHistoryDays) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["robot-stats", user?.id, days],
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
  const payload = asRecord(input);
  const items = Array.isArray(input) ? input : Array.isArray(payload.items) ? payload.items : [];

  return items.map(normalizeHistoryItem).filter(Boolean) as RobotHistoryItem[];
}

function normalizeHistoryItem(input: unknown): RobotHistoryItem | null {
  const value = asRecord(input);
  const active = text(value.active ?? value.symbol);
  const direction = text(value.direction ?? value.signal).toUpperCase();
  const result = text(value.result).toUpperCase();

  if (!active || (direction !== "CALL" && direction !== "PUT")) return null;
  if (result !== "WIN" && result !== "LOSS") return null;

  return {
    id: text(value.id) || `${active}:${text(value.finished_at ?? value.finishedAt)}`,
    createdAt: optionalText(value.created_at ?? value.createdAt),
    accountMode: normalizeAccountMode(value.account_mode ?? value.accountMode),
    active,
    direction,
    amount: number(value.amount) ?? 0,
    confidence: percentage(value.confidence),
    payout: percentage(value.payout),
    orderId: optionalText(value.order_id ?? value.orderId),
    result,
    profit: number(value.profit) ?? 0,
    openedAt: optionalText(value.opened_at ?? value.openedAt),
    finishedAt: optionalText(value.finished_at ?? value.finishedAt),
    timeframe: optionalText(value.timeframe),
  };
}

function normalizeStats(input: unknown): RobotStats {
  const value = asRecord(input);
  return {
    wins: nonNegative(value.wins),
    losses: nonNegative(value.losses),
    totalTrades: nonNegative(value.total_trades ?? value.totalTrades),
    winRate: percentage(value.win_rate ?? value.winRate) ?? 0,
    profit: number(value.profit) ?? 0,
    profitFactor: finiteOrNull(value.profit_factor ?? value.profitFactor),
    currentWinStreak: nonNegative(value.current_win_streak ?? value.currentWinStreak),
    currentLossStreak: nonNegative(value.current_loss_streak ?? value.currentLossStreak),
    bestWinStreak: nonNegative(value.best_win_streak ?? value.bestWinStreak),
    bestLossStreak: nonNegative(value.best_loss_streak ?? value.bestLossStreak),
  };
}

export function getEmptyRobotStats() {
  return EMPTY_STATS;
}

function normalizeAccountMode(input: unknown): "DEMO" | "REAL" | null {
  const mode = text(input).toUpperCase();
  return mode === "DEMO" || mode === "REAL" ? mode : null;
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

function text(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return typeof input === "string" ? input.trim() : "";
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
