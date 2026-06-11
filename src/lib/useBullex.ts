import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bullexApi } from "./api";

export function useBullexAccount() {
  return useQuery({
    queryKey: ["bullex", "account"],
    queryFn: async () => {
      const res = await bullexApi.account();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 8000,
    retry: 1,
    staleTime: 5000,
  });
}

export function useBullexBalance() {
  return useQuery({
    queryKey: ["bullex", "balance"],
    queryFn: async () => {
      const res = await bullexApi.balance();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    refetchInterval: 5000,
    retry: 1,
    staleTime: 3000,
  });
}

export function useConnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bullexApi.connect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
  });
}

export function useDisconnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bullexApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
  });
}

export function useReconnectBullex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bullexApi.reconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bullex"] }),
  });
}
