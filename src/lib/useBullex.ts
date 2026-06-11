import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, type ApiResult, bullexApi, isKnownApiError } from "./api";

function unwrap<T>(res: ApiResult<T>): T {
  if (!res.ok) throw new ApiError(res.error, res.code);
  return res.data;
}

function toastGenericError(error: Error) {
  const code = error instanceof ApiError ? error.code : undefined;
  if (!isKnownApiError(code)) toast.error(error.message || "Erro inesperado");
}

export function useBullexAccount() {
  return useQuery({
    queryKey: ["bullex", "account"],
    queryFn: async () => unwrap(await bullexApi.account()),
    refetchInterval: 8000,
    retry: 1,
    staleTime: 5000,
  });
}

export function useBullexBalance(enabled = true) {
  return useQuery({
    queryKey: ["bullex", "balance"],
    queryFn: async () => unwrap(await bullexApi.balance()),
    enabled,
    refetchInterval: 5000,
    retry: 1,
    staleTime: 3000,
  });
}

export function useConnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Parameters<typeof bullexApi.connect>[0]) => unwrap(await bullexApi.connect(payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
    onError: toastGenericError,
  });
}

export function useDisconnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.disconnect()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
    onError: toastGenericError,
  });
}

export function useReconnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await bullexApi.reconnect()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
    onError: toastGenericError,
  });
}
