import type { RobotState } from "@/hooks/useRobotState";

export function getRobotStateRefetchInterval(state: RobotState | undefined) {
  const robotActive = state?.enabled === true && state?.status !== "STOPPED";
  return robotActive ? 1000 : 2000;
}
