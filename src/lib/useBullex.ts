import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BULLEX_ACCOUNT_QUERY_KEY, getDisconnectedState } from "@/hooks/useBullExAccount";
import { ROBOT_STATE_QUERY_KEY } from "@/hooks/useRobotState";
import {
  ApiError,
  type ApiResult,
  type ChangeBullexModePayload,
  bullexApi,
  isKnownApiError,
  robotSyncConnection,
} from "./api";
import { useAuth } from "@/lib/useAuth";

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiError(res.error, res.code);
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
    refetchInterval: 3000,
    retry: 1,
    staleTime: 1000,
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
  return useMutation({
    mutationFn: async (payload: Parameters<typeof bullexApi.connect>[0]) =>
      unwrap(await bullexApi.connect(payload)),
    onSuccess: () => {
      console.log("[BULLEX CONNECT SUCCESS]");
    },
    onError: toastGenericError,
  });
}

export async function syncAfterBullExConnect(
  qc: ReturnType<typeof useQueryClient>,
  userId?: string,
) {
  console.log("[ACCOUNT REFETCH]");
  await qc.refetchQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY, type: "active" });
  await qc.refetchQueries({ queryKey: ["bullex"], type: "active" });

  if (userId) {
    console.log("[ROBOT STATE REFETCH]");
    await qc.refetchQueries({
      queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
      exact: true,
      type: "active",
    });
  }

  console.log("[ROBOT SYNC CONNECTION]");
  try {
    await robotSyncConnection();
  } catch (error) {
    console.warn("[ROBOT SYNC CONNECTION ERROR]", error);
  }

  if (userId) {
    console.log("[ROBOT STATE REFETCH]");
    await qc.refetchQueries({
      queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
      exact: true,
      type: "active",
    });
  }
}

export function useDisconnectBullex() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.disconnect()),
    onSuccess: async () => {
      qc.setQueryData([...BULLEX_ACCOUNT_QUERY_KEY, user?.id], getDisconnectedState());
      await qc.invalidateQueries({ queryKey: ["bullex"] });
      await qc.invalidateQueries({ queryKey: BULLEX_ACCOUNT_QUERY_KEY });
    },
    onError: toastGenericError,
  });
}

export function useReconnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.reconnect()),
    onSuccess: async () => {
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
