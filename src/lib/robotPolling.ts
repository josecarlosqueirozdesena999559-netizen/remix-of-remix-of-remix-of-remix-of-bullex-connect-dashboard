import type { RobotState } from "@/hooks/useRobotState";

export function getRobotStateRefetchInterval(state: RobotState | undefined) {
  const awaitingResult =
    state?.operation_in_progress === true ||
    state?.result_waiting === true ||
    state?.status === "PENDING_RESULT";

  return awaitingResult ? 1000 : 2000;
}
