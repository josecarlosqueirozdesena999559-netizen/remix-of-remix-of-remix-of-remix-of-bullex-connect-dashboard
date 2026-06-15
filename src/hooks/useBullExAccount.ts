import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type BullexAccount, bullexApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useRobotState } from "@/hooks/useRobotState";
import {
  createOptimisticConnectedBullExAccount,
  getBullExAccountBackoffRemaining,
  getBullExAccountRefetchInterval,
  registerBullExAccountFetchFailure,
  registerBullExAccountFetchSuccess,
  resetBullExAccountPolling,
  shouldTreatAccountStatusAsDisconnected,
} from "@/lib/bullexAccountPolling";

export const BULLEX_ACCOUNT_QUERY_KEY = ["bullex-account"] as const;

export type BullExAccountState = {
  connected: boolean;
  balance: number | null;
  currency: string | null;
  mode: BullexAccount["mode"] | null;
  email: string | null;
  requires_2fa: boolean;
  status: BullexAccount["status"] | "disconnected";
};

export function useBullExAccount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const robotState = useRobotState(user?.id);
  const userId = user?.id;
  const robotStateReady = Boolean(userId) && (robotState.data !== undefined || robotState.error != null);

  return useQuery({
    queryKey: [...BULLEX_ACCOUNT_QUERY_KEY, userId],
    queryFn: async () => {
      const activeUserId = user?.id;
      const now = Date.now();
      const backoffRemainingMs = getBullExAccountBackoffRemaining(activeUserId, now);
      if (backoffRemainingMs > 0) {
        console.log("[ACCOUNT_POLL_SKIPPED_BACKOFF]", {
          user_id: activeUserId ?? null,
          wait_ms: backoffRemainingMs,
        });

        const cachedState = queryClient.getQueryData<BullExAccountState>([
          ...BULLEX_ACCOUNT_QUERY_KEY,
          activeUserId,
        ]);
        return cachedState ?? getDisconnectedState();
      }

      console.log("[ACCOUNT REFETCH]");
      console.log("[BULLEX ACCOUNT FETCH]");

      const response = await bullexApi.account();
      if (!response.ok) {
        const backoffMs = registerBullExAccountFetchFailure(activeUserId, now);
        console.warn("[ACCOUNT_FETCH_FAILED]", {
          user_id: activeUserId ?? null,
          code: response.code ?? null,
          status: response.status ?? null,
          wait_ms: backoffMs,
        });

        if (shouldTreatAccountStatusAsDisconnected(response.status, response.code)) {
          const disconnected = getDisconnectedState();
          console.log("[BULLEX ACCOUNT UPDATED]", disconnected);
          return disconnected;
        }

        const error = new ApiError(response.error, response.code, response.status);
        console.error("[BULLEX ACCOUNT ERROR]", error);
        throw error;
      }

      registerBullExAccountFetchSuccess(activeUserId);
      const nextState = normalizeBullExAccount(response.data);
      console.log("[ACCOUNT_FETCH_SUCCESS]", {
        user_id: activeUserId ?? null,
        connected: nextState.connected,
        status: nextState.status,
      });
      console.log("[BULLEX ACCOUNT UPDATED]", nextState);
      return nextState;
    },
    enabled: robotStateReady,
    refetchInterval: () => {
      const remainingBackoffMs = getBullExAccountBackoffRemaining(userId);
      if (remainingBackoffMs > 0) {
        console.log("[ACCOUNT_POLL_BACKOFF_ACTIVE]", {
          user_id: userId ?? null,
          wait_ms: remainingBackoffMs,
        });
      }

      return getBullExAccountRefetchInterval(userId);
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 15000,
  });
}

export function normalizeBullExAccount(data: BullexAccount | null | undefined): BullExAccountState {
  const connected = data?.connected === true || data?.status === "connected";
  return {
    connected,
    balance: typeof data?.balance === "number" ? data.balance : null,
    currency: data?.currency ?? null,
    mode: data?.mode ?? null,
    email: data?.email ?? null,
    requires_2fa: Boolean((data as { requires_2fa?: unknown } | null | undefined)?.requires_2fa),
    status: connected ? "connected" : "disconnected",
  };
}

export function getDisconnectedState(): BullExAccountState {
  return {
    connected: false,
    balance: null,
    currency: null,
    mode: null,
    email: null,
    requires_2fa: false,
    status: "disconnected",
  };
}

export function resetBullExAccountState(userId?: string) {
  resetBullExAccountPolling(userId);
}
