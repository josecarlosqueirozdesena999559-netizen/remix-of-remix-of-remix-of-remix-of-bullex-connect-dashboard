import { createContext, useContext, useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useBullExAccountQuery, type BullExAccountState } from "@/hooks/useBullExAccount";
import { useBullExStatusQuery, type BullexConnectionStatus } from "@/hooks/useBullExStatus";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { useRobotConnectionSync } from "@/hooks/useRobotConnectionSync";
import { useRobotStateQuery, type RobotState } from "@/hooks/useRobotState";
import type { ApiError } from "@/lib/api";

type LiveTradingDataContextValue = {
  account: UseQueryResult<BullExAccountState, ApiError>;
  accountStatus: UseQueryResult<BullexConnectionStatus, ApiError>;
  robotState: UseQueryResult<RobotState, ApiError>;
  userId?: string;
};

const LiveTradingDataContext = createContext<LiveTradingDataContextValue | null>(null);

export function LiveTradingDataProvider({
  userId,
  children,
}: {
  userId?: string;
  children: React.ReactNode;
}) {
  const isDocumentVisible = usePageVisibility();
  const account = useBullExAccountQuery({
    userId,
    enabled: Boolean(userId),
    isDocumentVisible,
  });
  const accountStatus = useBullExStatusQuery({
    userId,
    enabled: Boolean(userId),
    isDocumentVisible,
  });
  const rawRobotState = useRobotStateQuery(userId, isDocumentVisible);
  const effectiveRobotState = useRobotConnectionSync({
    userId,
    accountConnected:
      account.data?.connected === true ||
      accountStatus.data?.status === "connected" ||
      rawRobotState.data?.connection_status_source === "cached_grace",
    robotState: rawRobotState.data,
  });

  const robotState = useMemo(
    () => ({ ...rawRobotState, data: effectiveRobotState }),
    [effectiveRobotState, rawRobotState],
  );
  const value = useMemo(
    () => ({ account, accountStatus, robotState, userId }),
    [account, accountStatus, robotState, userId],
  );

  return (
    <LiveTradingDataContext.Provider value={value}>{children}</LiveTradingDataContext.Provider>
  );
}

export function useLiveTradingData() {
  const context = useContext(LiveTradingDataContext);
  if (!context) {
    throw new Error("useLiveTradingData precisa ser usado dentro de LiveTradingDataProvider.");
  }

  return context;
}
