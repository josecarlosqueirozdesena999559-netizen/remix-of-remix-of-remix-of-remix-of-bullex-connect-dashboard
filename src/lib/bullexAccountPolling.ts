const NORMAL_ACCOUNT_POLL_MS = 10000;
const CONNECT_ACCOUNT_POLL_MS = 10000;
const CONNECT_ACCOUNT_POLL_WINDOW_MS = 20000;
const ACCOUNT_ERROR_BACKOFF_MS = [5000, 10000, 20000, 30000] as const;
const ACCOUNT_DISCONNECT_FAILURE_THRESHOLD = 3;

type AccountPollState = {
  consecutiveFailures: number;
  backoffUntil: number;
  connectBurstUntil: number;
};

const pollStateByUser = new Map<string, AccountPollState>();

function getPollState(userId: string) {
  let state = pollStateByUser.get(userId);
  if (!state) {
    state = {
      consecutiveFailures: 0,
      backoffUntil: 0,
      connectBurstUntil: 0,
    };
    pollStateByUser.set(userId, state);
  }
  return state;
}

export function getBullExAccountRefetchInterval(userId?: string, now = Date.now()) {
  if (!userId) return false;
  const state = getPollState(userId);

  if (state.backoffUntil > now) {
    return state.backoffUntil - now;
  }

  if (state.connectBurstUntil > now) {
    return CONNECT_ACCOUNT_POLL_MS;
  }

  return NORMAL_ACCOUNT_POLL_MS;
}

export function getBullExAccountBackoffRemaining(userId?: string, now = Date.now()) {
  if (!userId) return 0;
  const state = getPollState(userId);
  return Math.max(0, state.backoffUntil - now);
}

export function markBullExAccountConnectBurst(userId?: string, now = Date.now()) {
  if (!userId) return;
  const state = getPollState(userId);
  state.consecutiveFailures = 0;
  state.backoffUntil = 0;
  state.connectBurstUntil = now + CONNECT_ACCOUNT_POLL_WINDOW_MS;
}

export function registerBullExAccountFetchSuccess(userId?: string) {
  if (!userId) return;
  const state = getPollState(userId);
  state.consecutiveFailures = 0;
  state.backoffUntil = 0;
}

export function registerBullExAccountFetchFailure(userId?: string, now = Date.now()) {
  if (!userId) return ACCOUNT_ERROR_BACKOFF_MS[0];
  const state = getPollState(userId);
  state.consecutiveFailures += 1;
  state.connectBurstUntil = now;

  const delay =
    ACCOUNT_ERROR_BACKOFF_MS[
      Math.min(state.consecutiveFailures - 1, ACCOUNT_ERROR_BACKOFF_MS.length - 1)
    ];
  state.backoffUntil = now + delay;
  return delay;
}

export function getBullExAccountConsecutiveFailures(userId?: string) {
  if (!userId) return 0;
  return getPollState(userId).consecutiveFailures;
}

export function resetBullExAccountPolling(userId?: string) {
  if (!userId) return;
  pollStateByUser.delete(userId);
}

export function shouldTreatAccountStatusAsDisconnected(
  status?: number,
  code?: string,
  consecutiveFailures = ACCOUNT_DISCONNECT_FAILURE_THRESHOLD,
) {
  return (
    isAccountDisconnectResponse(status, code) &&
    consecutiveFailures >= ACCOUNT_DISCONNECT_FAILURE_THRESHOLD
  );
}

export function isAccountDisconnectResponse(status?: number, code?: string) {
  return status === 404 || code === "SESSION_NOT_FOUND" || code === "SESSION_DISCONNECTED";
}

export function createOptimisticConnectedBullExAccount(
  email: string,
  current?: BullExAccountState,
): BullExAccountState {
  return {
    connected: true,
    balance: current?.balance ?? null,
    currency: current?.currency ?? null,
    mode: current?.mode ?? null,
    email,
    requires_2fa: false,
    status: "connected",
  };
}

export const bullExAccountPollingConfig = {
  normalMs: NORMAL_ACCOUNT_POLL_MS,
  connectMs: CONNECT_ACCOUNT_POLL_MS,
  connectWindowMs: CONNECT_ACCOUNT_POLL_WINDOW_MS,
  backoffMs: ACCOUNT_ERROR_BACKOFF_MS,
  disconnectFailureThreshold: ACCOUNT_DISCONNECT_FAILURE_THRESHOLD,
};
import type { BullExAccountState } from "../hooks/useBullExAccount.ts";
