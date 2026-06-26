import { useSyncExternalStore } from "react";

export type BullExLoginPhase =
  | "idle"
  | "connecting"
  | "authenticating"
  | "opening_connection"
  | "loading_balance"
  | "ready"
  | "reconnecting"
  | "failed"
  | "cancelled";

export type BullExLoginFlowState = {
  phase: BullExLoginPhase;
  email: string | null;
  startedAt: number | null;
  backendStatus: string | null;
  failureMessage: string | null;
  visualTimeoutReached: boolean;
  isPending: boolean;
};

const DEFAULT_STATE: BullExLoginFlowState = {
  phase: "idle",
  email: null,
  startedAt: null,
  backendStatus: null,
  failureMessage: null,
  visualTimeoutReached: false,
  isPending: false,
};

const stateByUser = new Map<string, BullExLoginFlowState>();
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function getKey(userId?: string) {
  return userId ?? "__anonymous__";
}

function setState(userId: string | undefined, nextState: BullExLoginFlowState) {
  stateByUser.set(getKey(userId), nextState);
  emitChange();
}

export function getBullExLoginState(userId?: string) {
  return stateByUser.get(getKey(userId)) ?? DEFAULT_STATE;
}

export function startBullExLogin(email: string, userId?: string) {
  setState(userId, {
    phase: "connecting",
    email,
    startedAt: Date.now(),
    backendStatus: null,
    failureMessage: null,
    visualTimeoutReached: false,
    isPending: true,
  });
}

export function markBullExLoginVisualTimeout(userId?: string) {
  const current = getBullExLoginState(userId);
  if (!current.isPending || current.visualTimeoutReached) return;

  setState(userId, {
    ...current,
    visualTimeoutReached: true,
  });
}

export function updateBullExLoginBackendStatus(status: string | null | undefined, userId?: string) {
  const current = getBullExLoginState(userId);
  if (!current.isPending) return;

  setState(userId, {
    ...current,
    backendStatus: status ?? null,
    phase: getPhaseForStatus(status, current.startedAt),
  });
}

export function completeBullExLogin(userId?: string) {
  const current = getBullExLoginState(userId);
  setState(userId, {
    ...current,
    phase: "ready",
    backendStatus: current.backendStatus ?? "CONNECTED",
    failureMessage: null,
    visualTimeoutReached: false,
    isPending: false,
  });
}

export function failBullExLogin(message: string, userId?: string) {
  const current = getBullExLoginState(userId);
  setState(userId, {
    ...current,
    phase: "failed",
    failureMessage: message,
    backendStatus: current.backendStatus ?? "LOGIN_FAILED",
    visualTimeoutReached: false,
    isPending: false,
  });
}

export function cancelBullExLogin(userId?: string) {
  const current = getBullExLoginState(userId);
  setState(userId, {
    ...current,
    phase: "cancelled",
    failureMessage: null,
    visualTimeoutReached: false,
    isPending: false,
  });
}

export function resetBullExLoginState(userId?: string) {
  stateByUser.delete(getKey(userId));
  emitChange();
}

export function isBullExLoginPending(userId?: string) {
  return getBullExLoginState(userId).isPending;
}

export function useBullExLoginState(userId?: string) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getBullExLoginState(userId),
    () => getBullExLoginState(userId),
  );
}

export function getBullExLoginStepLabel(state: BullExLoginFlowState) {
  if (state.phase === "ready") return "Pronto.";
  if (state.phase === "failed") return state.failureMessage ?? "Falha ao conectar.";
  if (state.phase === "cancelled") return "Login cancelado.";
  if (state.phase === "reconnecting") return "Reconectando automaticamente...";

  const backendPhase = getPhaseForStatus(state.backendStatus, state.startedAt);
  if (backendPhase === "reconnecting") return "Reconectando automaticamente...";

  switch (backendPhase) {
    case "authenticating":
      return "Autenticando...";
    case "opening_connection":
      return "Abrindo conexao...";
    case "loading_balance":
      return "Carregando saldo...";
    default:
      return "Conectando...";
  }
}

function getPhaseForStatus(
  status: string | null | undefined,
  startedAt: number | null,
): BullExLoginPhase {
  const normalized = status?.trim().toUpperCase();

  switch (normalized) {
    case "CONNECTED":
      return "ready";
    case "LOGIN_FAILED":
    case "FAILED":
      return "failed";
    case "RECONNECTING":
    case "SESSION_RECONNECTING":
      return "reconnecting";
    case "AUTHENTICATING":
      return "authenticating";
    case "OPENING_CONNECTION":
    case "CONNECTING_SESSION":
      return "opening_connection";
    case "LOADING_BALANCE":
    case "SYNCING_BALANCE":
      return "loading_balance";
    case "CONNECTING":
    case "LOGIN_STARTED":
    case "PENDING":
      return "connecting";
    default:
      return getPhaseForElapsed(startedAt);
  }
}

function getPhaseForElapsed(startedAt: number | null) {
  if (!startedAt) return "connecting";

  const elapsed = Date.now() - startedAt;
  if (elapsed < 10_000) return "connecting";
  if (elapsed < 25_000) return "authenticating";
  if (elapsed < 55_000) return "opening_connection";
  return "loading_balance";
}
