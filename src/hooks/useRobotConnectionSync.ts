import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { robotSyncConnection } from "@/lib/api";
import { ROBOT_STATE_QUERY_KEY, type RobotState } from "@/hooks/useRobotState";

const SYNC_RETRY_DELAY_MS = 10000;
const lastSyncAttemptByUser = new Map<string, number>();

export function useRobotConnectionSync({
  userId,
  accountConnected,
  robotState,
}: {
  userId?: string;
  accountConnected: boolean;
  robotState?: RobotState;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !accountConnected || !isRobotDisconnected(robotState)) return;

    const now = Date.now();
    const lastSyncAttempt = lastSyncAttemptByUser.get(userId) ?? 0;
    if (now - lastSyncAttempt < SYNC_RETRY_DELAY_MS) return;
    lastSyncAttemptByUser.set(userId, now);

    console.log("[ROBOT SYNC CONNECTION]");
    void robotSyncConnection()
      .catch((error) => {
        console.warn("[ROBOT SYNC CONNECTION ERROR]", error);
      })
      .finally(() => {
        void queryClient.refetchQueries({
          queryKey: [...ROBOT_STATE_QUERY_KEY, userId],
          exact: true,
        });
      });
  }, [accountConnected, queryClient, robotState, userId]);

  return useMemo(
    () => preferAccountConnection(robotState, accountConnected),
    [accountConnected, robotState],
  );
}

function preferAccountConnection(
  robotState: RobotState | undefined,
  accountConnected: boolean,
): RobotState | undefined {
  if (!robotState || !accountConnected || !isRobotDisconnected(robotState)) return robotState;

  return {
    ...robotState,
    connected: true,
    disconnected: false,
    status: robotState.status === "ACCOUNT_DISCONNECTED" ? "STOPPED" : robotState.status,
    real_block_reason:
      robotState.real_block_reason === "Conta BullEx desconectada"
        ? null
        : robotState.real_block_reason,
    rejection_reason:
      robotState.rejection_reason === "Conta BullEx desconectada"
        ? null
        : robotState.rejection_reason,
    last_rejection_reason:
      robotState.last_rejection_reason === "Conta BullEx desconectada"
        ? null
        : robotState.last_rejection_reason,
  };
}

function isRobotDisconnected(robotState: RobotState | undefined) {
  if (robotState?.connection_status_source === "cached_grace") return false;

  return (
    robotState?.connected === false ||
    robotState?.disconnected === true ||
    robotState?.status === "ACCOUNT_DISCONNECTED"
  );
}
