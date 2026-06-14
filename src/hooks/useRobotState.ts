import { useQuery } from "@tanstack/react-query";
import { ApiError, robotState } from "@/lib/api";
import { normalizeRobotState } from "@/lib/normalizeRobotState";
import { getRobotStateRefetchInterval } from "@/lib/robotPolling";
import { syncRobotSettings } from "@/lib/robotSettings";

export { normalizeRobotState } from "@/lib/normalizeRobotState";

export const ROBOT_STATE_QUERY_KEY = ["robot-state"] as const;

export type RobotDirection = "CALL" | "PUT" | "WAIT";

export type RobotSignal = {
  symbol: string;
  direction: RobotDirection;
  confidence: number | null;
  strategy_score: number | null;
  strategy_name: string | null;
  used_strategies: string[];
  strategy_reason: string | null;
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
  expires_at: string | null;
  sent_at: string | null;
  finished_at: string | null;
  profit: number | null;
};

export type RobotState = {
  enabled: boolean;
  connected: boolean;
  status: string;
  allow_real: boolean;
  confirm_real: boolean;
  account_mode: "DEMO" | "REAL";
  active_mode: string | null;
  connection_status_source: string | null;
  real_ready: boolean;
  real_block_reason: string | null;
  stop_reason: string | null;
  next_cycle_at: string | null;
  server_time: string | null;
  cycle_minutes: number;
  entry_value: number | null;
  stop_win: number | null;
  stop_loss: number | null;
  seconds_until_analysis_window: number;
  seconds_until_next_cycle: number;
  seconds_until_entry_window: number;
  display_countdown_label: string | null;
  display_countdown_seconds: number | null;
  expiration_seconds: number;
  expires_at: string | null;
  entry_window_open: boolean;
  operation_in_progress: boolean;
  result_waiting: boolean;
  pending_signal: RobotSignal | null;
  best_candidate: RobotSignal | null;
  last_signal: RobotSignal | null;
  last_trade: RobotTrade | null;
  wins: number;
  losses: number;
  profit: number;
  last_order_error: string | null;
  order_fallback_in_progress: boolean;
  order_fallback_attempt: number;
  order_fallback_max_attempts: number;
  rejection_reason: string | null;
  last_rejection_reason: string | null;
  rejected_at: string | null;
  disconnected: boolean;
  fetched_at: number;
};

export function useRobotState(userId?: string) {
  return useQuery({
    queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) throw new ApiError("Não autenticado", "NO_AUTH");
      console.log("[ROBOT STATE REFETCH]");
      console.log(`[ROBOT STATE FETCH user_id=${userId}]`);
      const response = await robotState(userId);

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
      syncRobotSettings(userId, {
        entryValue: nextState.entry_value,
        stopWin: nextState.stop_win,
        stopLoss: nextState.stop_loss,
      });
      console.log("[ROBOT STATE UPDATED]", nextState);
      return nextState;
    },
    enabled: Boolean(userId),
    refetchInterval: (query) => getRobotStateRefetchInterval(query.state.data),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 1000,
  });
}

export function createStoppedRobotState(disconnected = false): RobotState {
  return {
    enabled: false,
    connected: !disconnected,
    status: "STOPPED",
    allow_real: false,
    confirm_real: false,
    account_mode: "DEMO",
    active_mode: null,
    connection_status_source: null,
    real_ready: false,
    real_block_reason: disconnected ? "Conta BullEx desconectada" : null,
    stop_reason: null,
    next_cycle_at: null,
    server_time: null,
    cycle_minutes: 5,
    entry_value: null,
    stop_win: null,
    stop_loss: null,
    seconds_until_analysis_window: 0,
    seconds_until_next_cycle: 0,
    seconds_until_entry_window: 0,
    display_countdown_label: null,
    display_countdown_seconds: null,
    expiration_seconds: 0,
    expires_at: null,
    entry_window_open: false,
    operation_in_progress: false,
    result_waiting: false,
    pending_signal: null,
    best_candidate: null,
    last_signal: null,
    last_trade: null,
    wins: 0,
    losses: 0,
    profit: 0,
    last_order_error: null,
    order_fallback_in_progress: false,
    order_fallback_attempt: 0,
    order_fallback_max_attempts: 3,
    rejection_reason: disconnected ? "Conta BullEx desconectada" : null,
    last_rejection_reason: disconnected ? "Conta BullEx desconectada" : null,
    rejected_at: null,
    disconnected,
    fetched_at: Date.now(),
  };
}
