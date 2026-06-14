import { useQuery } from "@tanstack/react-query";
import { ApiError, robotState } from "@/lib/api";
import { normalizeRobotState } from "@/lib/normalizeRobotState";

export { normalizeRobotState } from "@/lib/normalizeRobotState";

export const ROBOT_STATE_QUERY_KEY = ["robot-state"] as const;

export type RobotDirection = "CALL" | "PUT" | "WAIT";

export type RobotSignal = {
  symbol: string;
  direction: RobotDirection;
  confidence: number | null;
  payout: number | null;
  reason: string | null;
  created_at: string | null;
};

export type RobotTrade = {
  active: string;
  direction: RobotDirection;
  amount: number | null;
  order_id: string | null;
  confidence: number | null;
  payout: number | null;
  result: string;
  sent_at: string | null;
  finished_at: string | null;
  profit: number | null;
};

export type RobotState = {
  enabled: boolean;
  status: string;
  allow_real: boolean;
  confirm_real: boolean;
  account_mode: "DEMO" | "REAL";
  active_mode: string | null;
  real_ready: boolean;
  real_block_reason: string | null;
  next_cycle_at: string | null;
  seconds_until_next_cycle: number;
  seconds_until_entry_window: number;
  expiration_seconds: number;
  entry_window_open: boolean;
  operation_in_progress: boolean;
  result_waiting: boolean;
  pending_signal: RobotSignal | null;
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
      const response = await robotState();

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
    allow_real: false,
    confirm_real: false,
    account_mode: "DEMO",
    active_mode: null,
    real_ready: false,
    real_block_reason: disconnected ? "Conta BullEx desconectada" : null,
    next_cycle_at: null,
    seconds_until_next_cycle: 0,
    seconds_until_entry_window: 0,
    expiration_seconds: 0,
    entry_window_open: false,
    operation_in_progress: false,
    result_waiting: false,
    pending_signal: null,
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
