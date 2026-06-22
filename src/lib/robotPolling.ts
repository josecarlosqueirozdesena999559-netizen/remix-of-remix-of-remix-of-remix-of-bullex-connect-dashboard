import type { RobotState } from "@/hooks/useRobotState";

const ACTIVE_ROBOT_POLL_MS = 1000;
const IDLE_ROBOT_POLL_MS = 10000;
const ROBOT_ERROR_BACKOFF_MS = [5000, 10000, 20000, 30000] as const;

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

  const robotActive = state?.enabled === true && state?.status !== "STOPPED";
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
