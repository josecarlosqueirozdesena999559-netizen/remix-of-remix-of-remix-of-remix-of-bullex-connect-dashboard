import { useQuery } from "@tanstack/react-query";
import { ApiError, type BullexAccount, bullexApi } from "@/lib/api";

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
  return useQuery({
    queryKey: BULLEX_ACCOUNT_QUERY_KEY,
    queryFn: async () => {
      console.log("[BULLEX ACCOUNT FETCH]");

      const response = await bullexApi.account();
      if (!response.ok) {
        if (response.code === "SESSION_NOT_FOUND" || response.code === "SESSION_DISCONNECTED") {
          const disconnected = getDisconnectedState();
          console.log("[BULLEX ACCOUNT UPDATED]", disconnected);
          return disconnected;
        }

        const error = new ApiError(response.error, response.code);
        console.error("[BULLEX ACCOUNT ERROR]", error);
        throw error;
      }

      const nextState = normalizeBullExAccount(response.data);
      console.log("[BULLEX ACCOUNT UPDATED]", nextState);
      return nextState;
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 4000,
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
