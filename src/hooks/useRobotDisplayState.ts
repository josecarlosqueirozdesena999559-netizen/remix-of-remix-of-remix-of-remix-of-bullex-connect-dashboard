import { useEffect, useMemo, useRef } from "react";
import type { RobotSignal, RobotState } from "@/hooks/useRobotState";

export function useRobotDisplayState(robotState: RobotState | undefined) {
  const retainedPendingSignalRef = useRef<RobotSignal | null>(null);

  const livePendingSignal = robotState?.pending_signal ?? null;
  const displayPendingSignal =
    livePendingSignal ??
    (robotState?.status === "WAITING_NEXT_CANDLE_ENTRY" ? retainedPendingSignalRef.current : null);

  useEffect(() => {
    if (livePendingSignal) {
      retainedPendingSignalRef.current = livePendingSignal;
      return;
    }

    if (
      !robotState ||
      robotState.status === "SENDING_ORDER" ||
      robotState.status === "ORDER_REJECTED" ||
      robotState.status === "SIGNAL_REJECTED" ||
      robotState.status === "PENDING_RESULT" ||
      robotState.status === "RESULT_RECEIVED" ||
      robotState.status === "STOPPED" ||
      robotState.status === "WAITING_NEXT_CYCLE"
    ) {
      retainedPendingSignalRef.current = null;
    }
  }, [livePendingSignal, robotState?.status, robotState?.cycle_id]);

  return useMemo(() => {
    if (!robotState) return robotState;
    if (robotState.pending_signal === displayPendingSignal) return robotState;
    return { ...robotState, pending_signal: displayPendingSignal };
  }, [displayPendingSignal, robotState]);
}
