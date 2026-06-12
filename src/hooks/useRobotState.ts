import { useQuery } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";

export const ROBOT_STATE_QUERY_KEY = ["robot-state"] as const;

export type RobotDirection = "CALL" | "PUT" | "WAIT";

export type RobotSignal = {
  symbol: string;
  direction: RobotDirection;
  confidence: number | null;
  payout: number | null;
};

export type RobotTrade = {
  active: string;
  direction: RobotDirection;
  amount: number | null;
  confidence: number | null;
  payout: number | null;
  result: string;
  sent_at: string | null;
  profit: number | null;
};

export type RobotState = {
  enabled: boolean;
  status: string;
  next_cycle_at: string | null;
  seconds_until_next_cycle: number;
  operation_in_progress: boolean;
  last_signal: RobotSignal | null;
  last_trade: RobotTrade | null;
  wins: number;
  losses: number;
  profit: number;
  rejection_reason: string | null;
  disconnected: boolean;
  fetched_at: number;
};

export function useRobotState(userId?: string) {
  return useQuery({
    queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
    queryFn: async () => {
      console.log("[ROBOT STATE FETCH]");
      const response = await apiRequest<unknown>("/robot/state");

      if (!response.ok) {
        if (response.code === "SESSION_NOT_FOUND" || response.code === "SESSION_DISCONNECTED") {
          const disconnectedState = createStoppedRobotState(true);
          console.log("[ROBOT STATE UPDATED]", disconnectedState);
          return disconnectedState;
        }

        const error = new ApiError(response.error, response.code);
        console.error("[ROBOT STATE ERROR]", error);
        throw error;
      }

      const nextState = normalizeRobotState(response.data);
      console.log("[ROBOT STATE UPDATED]", nextState);
      return nextState;
    },
    enabled: Boolean(userId),
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 1000,
  });
}

export function createStoppedRobotState(disconnected = false): RobotState {
  return {
    enabled: false,
    status: "STOPPED",
    next_cycle_at: null,
    seconds_until_next_cycle: 0,
    operation_in_progress: false,
    last_signal: null,
    last_trade: null,
    wins: 0,
    losses: 0,
    profit: 0,
    rejection_reason: disconnected ? "Conta BullEx desconectada" : null,
    disconnected,
    fetched_at: Date.now(),
  };
}

function normalizeRobotState(input: unknown): RobotState {
  const value = asRecord(input);
  return {
    enabled: value.enabled === true,
    status: normalizeText(value.status, "STOPPED").toUpperCase(),
    next_cycle_at: normalizeOptionalText(value.next_cycle_at ?? value.nextCycleAt),
    seconds_until_next_cycle: Math.max(
      0,
      normalizeNumber(value.seconds_until_next_cycle ?? value.secondsUntilNextCycle) ?? 0,
    ),
    operation_in_progress:
      value.operation_in_progress === true || value.operationInProgress === true,
    last_signal: normalizeSignal(value.last_signal ?? value.lastSignal),
    last_trade: normalizeTrade(value.last_trade ?? value.lastTrade),
    wins: Math.max(0, normalizeNumber(value.wins) ?? 0),
    losses: Math.max(0, normalizeNumber(value.losses) ?? 0),
    profit: normalizeNumber(value.profit) ?? 0,
    rejection_reason: normalizeOptionalText(value.rejection_reason ?? value.rejectionReason),
    disconnected: false,
    fetched_at: Date.now(),
  };
}

function normalizeSignal(input: unknown): RobotSignal | null {
  const value = asRecord(input);
  const symbol = normalizeText(value.symbol ?? value.active ?? value.asset);
  const direction = normalizeDirection(value.signal ?? value.direction ?? value.type);
  if (!symbol || !direction) return null;

  return {
    symbol,
    direction,
    confidence: normalizePercentage(value.confidence ?? value.score ?? value.probability),
    payout: normalizePercentage(value.payout),
  };
}

function normalizeTrade(input: unknown): RobotTrade | null {
  const value = asRecord(input);
  const active = normalizeText(value.active ?? value.symbol ?? value.asset);
  const direction = normalizeDirection(value.direction ?? value.signal ?? value.type);
  if (!active || !direction) return null;

  return {
    active,
    direction,
    amount: normalizeNumber(value.amount ?? value.entry_value ?? value.entryValue),
    confidence: normalizePercentage(value.confidence),
    payout: normalizePercentage(value.payout),
    result: normalizeText(value.result, "PENDING_RESULT").toUpperCase(),
    sent_at: normalizeOptionalText(value.sent_at ?? value.sentAt),
    profit: normalizeNumber(value.profit ?? value.pnl ?? value.result_amount ?? value.resultAmount),
  };
}

function normalizeDirection(input: unknown): RobotDirection | null {
  const direction = normalizeText(input).toUpperCase();
  return direction === "CALL" || direction === "PUT" || direction === "WAIT" ? direction : null;
}

function normalizePercentage(input: unknown) {
  const value = normalizeNumber(input);
  if (value == null) return null;
  return value <= 1 ? value * 100 : value;
}

function normalizeNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const number = Number(input.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function normalizeText(input: unknown, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function normalizeOptionalText(input: unknown) {
  const value = normalizeText(input);
  return value || null;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
