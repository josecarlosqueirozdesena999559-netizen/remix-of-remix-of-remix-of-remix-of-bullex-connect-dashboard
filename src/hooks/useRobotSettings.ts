import { useSyncExternalStore } from "react";
import {
  readRobotSettings,
  saveRobotSettings,
  subscribeRobotSettings,
  type RobotSettings,
} from "@/lib/robotSettings";

export function useRobotSettings(userId?: string) {
  const settings = useSyncExternalStore(
    subscribeRobotSettings,
    () => readRobotSettings(userId),
    () => readRobotSettings(userId),
  );

  function setSettings(nextSettings: RobotSettings) {
    if (!userId) return;
    saveRobotSettings(userId, nextSettings);
  }

  return { settings, setSettings };
}
