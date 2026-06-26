import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BULLEX_ACCOUNT_QUERY_KEY, getDisconnectedState } from "@/hooks/useBullExAccount";
import { createStoppedRobotState, ROBOT_STATE_QUERY_KEY } from "@/hooks/useRobotState";
import { resetRobotPresentationState } from "@/lib/robotPresentation";
import {
  ApiError,
  type ApiResult,
  type ChangeBullexModePayload,
  bullexApi,
  isKnownApiError,
  robotSyncConnection,
} from "./api";
import {
  getBullExAccountRefetchInterval,
  getBullExAccountBackoffRemaining,
  markBullExAccountConnectBurst,
  resetBullExAccountPolling,
} from "./bullexAccountPolling";
import { useAuth } from "@/lib/useAuth";

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiError(res.error, res.code, res.status);
  return res.data;
}

function toastGenericError(error: Error) {
  const code = error instanceof ApiError ? error.code : undefined;
  if (!isKnownApiError(code)) toast.error(error.message || "Erro inesperado");
}

export function useBullexAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bullex", user?.id, "account"],
    queryFn: async () => {
      console.log("[ACCOUNT REFETCH]");
      return unwrap(await bullexApi.account());
    },
    enabled: Boolean(user?.id),
    refetchInterval: () => getBullExAccountRefetchInterval(user?.id),
    retry: false,
    staleTime: 15000,
  });
}

export function useBullexBalance(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bullex", user?.id, "balance"],
    queryFn: async () => unwrap(await bullexApi.balance()),
    enabled: enabled && Boolean(user?.id),
    refetchInterval: 5000,
    retry: 1,
    staleTime: 3000,
  });
}

export function useConnectBullex() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      sms_code?: string;
      signal?: AbortSignal;
    }) => unwrap(await bullexApi.connect(payload, { signal: payload.signal })),
    onSuccess: () => {
      markBullExAccountConnectBurst(user?.id);
      console.log("[BULLEX CONNECT SUCCESS]");
    },
    onError: toastGenericError,
  });
}

export async function syncAfterBullExConnect(
  qc: ReturnType<typeof useQueryClient>,
  userId?: string,
) {
  if (userId) {
    await qc.refetchQueries({
      queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
      exact: true,
      type: "active",
    });
  }

  try {
    await robotSyncConnection();
  } catch (error) {
    console.warn("[ROBOT SYNC CONNECTION ERROR]", error);
  }

  if (userId) {
    const remainingBackoffMs = getBullExAccountBackoffRemaining(userId);
    if (remainingBackoffMs > 0) {
      resetBullExAccountPolling(userId);
    }
  }

  await qc.refetchQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY, type: "active" });
  console.log("[CONNECT_SUCCESS_STATE_SYNCED]", { user_id: userId ?? null });
}

export function useDisconnectBullex() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.disconnect()),
    onSuccess: async () => {
      qc.setQueryData([...BULLEX_ACCOUNT_QUERY_KEY, user?.id], getDisconnectedState());
      qc.setQueryData([...ROBOT_STATE_QUERY_KEY, user?.id], createStoppedRobotState(true));
      resetRobotPresentationState();
      await qc.refetchQueries({
        queryKey: [...ROBOT_STATE_QUERY_KEY, user?.id],
        exact: true,
        type: "active",
      });
      await qc.invalidateQueries({ queryKey: ["bullex"] });
      await qc.invalidateQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY });
    },
    onError: toastGenericError,
  });
}

export function useReconnectBullex() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.reconnect()),
    onSuccess: async () => {
      markBullExAccountConnectBurst(user?.id);
      await qc.invalidateQueries({ queryKey: ["bullex"] });
      await qc.invalidateQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY });
    },
    onError: toastGenericError,
  });
}

export function useChangeBullexMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChangeBullexModePayload) =>
      unwrap(await bullexApi.changeMode(payload)),
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY, type: "active" });
    },
    onError: toastGenericError,
  });
}
