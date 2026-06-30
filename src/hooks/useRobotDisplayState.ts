import type { RobotState } from "@/hooks/useRobotState";

export function useRobotDisplayState(robotState: RobotState | undefined) {
  return robotState;
}
