import type { RobotState } from "@/hooks/useRobotState";

const ACTIVE_ROBOT_POLL_MS = 1000;
const IDLE_ROBOT_POLL_MS = 5000;
const ROBOT_ERROR_BACKOFF_MS = [5000, 10000, 20000, 30000] as const;
const ACTIVE_STATUSES = new Set([
  "SIGNAL_FOUND",
  "WAITING_ENTRY",
  "BUYING",
  "ORDER_OPEN",
  "WAITING_RESULT",
  "WIN",
  "LOSS",
  "WAITING_ENTRY_WINDOW",
  "WAITING_NEXT_CANDLE_ENTRY",
  "SENDING_ORDER",
  "PENDING_RESULT",
  "RESULT_RECEIVED",
  "WAITING_GALE_ENTRY",
  "SENDING_GALE_ORDER",
  "PENDING_GALE_RESULT",
  "GALE_RESULT_RECEIVED",
]);

type RobotPollState = {
  consecutiveFailures: number;
  backoffUntil: number;
};

const pollStateByUser = new Map<string, RobotPollState>();

function getPollState(userId: string) {
  let state = pollStateByUser.get(userId);
  if (!state) {
    state = { consecutiveFailures: 0, backoffUntil: 0 };
    pollStateByUser.set(userId, state);
  }

  return state;
}

export function getRobotStateRefetchInterval(
  state: RobotState | undefined,
  userId?: string,
  now = Date.now(),
) {
  if (userId) {
    const pollState = getPollState(userId);
    if (pollState.backoffUntil > now) {
      return pollState.backoffUntil - now;
    }
  }

  const status = state?.status?.toUpperCase();
  const robotActive =
    (state?.enabled === true && status !== "STOPPED") ||
    state?.operation_in_progress === true ||
    state?.result_waiting === true ||
    state?.last_trade?.result === "PENDING_RESULT" ||
    (status != null && ACTIVE_STATUSES.has(status));
  return robotActive ? ACTIVE_ROBOT_POLL_MS : IDLE_ROBOT_POLL_MS;
}

export function registerRobotStateFetchSuccess(userId?: string) {
  if (!userId) return;
  const state = getPollState(userId);
  state.consecutiveFailures = 0;
  state.backoffUntil = 0;
}

export function registerRobotStateFetchFailure(userId?: string, now = Date.now()) {
  if (!userId) return ROBOT_ERROR_BACKOFF_MS[0];
  const state = getPollState(userId);
  state.consecutiveFailures += 1;
  const delay =
    ROBOT_ERROR_BACKOFF_MS[
      Math.min(state.consecutiveFailures - 1, ROBOT_ERROR_BACKOFF_MS.length - 1)
    ];
  state.backoffUntil = now + delay;
  return delay;
}

export function resetRobotStatePolling(userId?: string) {
  if (!userId) return;
  pollStateByUser.delete(userId);
}
