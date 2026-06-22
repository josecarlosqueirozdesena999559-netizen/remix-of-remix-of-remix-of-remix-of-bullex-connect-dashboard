import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type BullexAccount, bullexApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import {
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

export function useBullExAccountQuery({
  userId,
  enabled = true,
  isDocumentVisible = true,
}: {
  userId?: string;
  enabled?: boolean;
  isDocumentVisible?: boolean;
} = {}) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [...BULLEX_ACCOUNT_QUERY_KEY, userId],
    queryFn: async () => {
      const now = Date.now();
      const backoffRemainingMs = getBullExAccountBackoffRemaining(userId, now);
      if (backoffRemainingMs > 0) {
        console.log("[ACCOUNT_POLL_SKIPPED_BACKOFF]", {
          user_id: userId ?? null,
          wait_ms: backoffRemainingMs,
        });

        const cachedState = queryClient.getQueryData<BullExAccountState>([
          ...BULLEX_ACCOUNT_QUERY_KEY,
          userId,
        ]);
        return cachedState ?? getDisconnectedState();
      }

      console.log("[ACCOUNT REFETCH]");
      console.log("[BULLEX ACCOUNT FETCH]");

      const response = await bullexApi.account();
      if (!response.ok) {
        const backoffMs = registerBullExAccountFetchFailure(userId, now);
        console.warn("[ACCOUNT_FETCH_FAILED]", {
          user_id: userId ?? null,
          code: response.code ?? null,
          status: response.status ?? null,
          wait_ms: backoffMs,
        });

        if (shouldTreatAccountStatusAsDisconnected(response.status, response.code)) {
          registerBullExAccountFetchSuccess(userId);
          const disconnected = getDisconnectedState();
          console.log("[BULLEX ACCOUNT UPDATED]", disconnected);
          return disconnected;
        }

        const error = new ApiError(response.error, response.code, response.status);
        console.error("[BULLEX ACCOUNT ERROR]", error);
        throw error;
      }

      registerBullExAccountFetchSuccess(userId);
      const nextState = normalizeBullExAccount(response.data);
      console.log("[ACCOUNT_FETCH_SUCCESS]", {
        user_id: userId ?? null,
        connected: nextState.connected,
        status: nextState.status,
      });
      console.log("[BULLEX ACCOUNT UPDATED]", nextState);
      return nextState;
    },
    enabled: enabled && Boolean(userId),
    refetchInterval: () => {
      if (!isDocumentVisible) return false;

      const remainingBackoffMs = getBullExAccountBackoffRemaining(userId);
      if (remainingBackoffMs > 0) {
        console.log("[ACCOUNT_POLL_BACKOFF_ACTIVE]", {
          user_id: userId ?? null,
          wait_ms: remainingBackoffMs,
        });
      }

      return getBullExAccountRefetchInterval(userId);
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    staleTime: 15000,
  });
}

export function useBullExAccount() {
  const { user } = useAuth();
  return useBullExAccountQuery({ userId: user?.id });
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
