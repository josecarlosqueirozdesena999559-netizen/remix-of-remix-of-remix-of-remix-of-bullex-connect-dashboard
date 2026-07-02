import { useQuery } from "@tanstack/react-query";
import { ApiError, bullexApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

export const BULLEX_STATUS_QUERY_KEY = ["bullex-status"] as const;

export type BullexConnectionStatus = {
  status: string;
};

export function useBullExStatusQuery({
  userId,
  enabled = true,
  isDocumentVisible = true,
}: {
  userId?: string;
  enabled?: boolean;
  isDocumentVisible?: boolean;
} = {}) {
  return useQuery({
    queryKey: [...BULLEX_STATUS_QUERY_KEY, userId],
    queryFn: async () => {
      const response = await bullexApi.status();
      if (!response.ok) {
        throw new ApiError(response.error, response.code, response.status);
      }

      return {
        status: typeof response.data?.status === "string" ? response.data.status : "disconnected",
      } satisfies BullexConnectionStatus;
    },
    enabled: enabled && Boolean(userId),
    refetchInterval: isDocumentVisible ? 10000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    staleTime: 9000,
  });
}

export function useBullExStatus() {
  const { user } = useAuth();
  return useBullExStatusQuery({ userId: user?.id });
}
