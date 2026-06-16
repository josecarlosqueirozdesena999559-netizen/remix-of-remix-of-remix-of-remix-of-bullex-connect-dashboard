import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  markRobotConfigPending,
  readRobotSettings,
  saveRobotSettings,
  subscribeRobotSettings,
  type RobotSettings,
} from "@/lib/robotSettings";
import { ApiError, robotConfig } from "@/lib/api";

export function useRobotSettings(userId?: string) {
  const queryClient = useQueryClient();
  const settings = useSyncExternalStore(
    subscribeRobotSettings,
    () => readRobotSettings(userId),
    () => readRobotSettings(userId),
  );

  function setSettings(nextSettings: RobotSettings) {
    if (!userId) return;
    saveRobotSettings(userId, nextSettings);
  }

  async function saveSettings(
    nextSettings: RobotSettings,
    robotConfigState: { enabled: boolean; cycleMinutes: number },
  ) {
    if (!userId) throw new ApiError("Não autenticado", "NO_AUTH");

    markRobotConfigPending(userId, nextSettings);
    const response = await robotConfig({
      enabled: robotConfigState.enabled,
      entry_value: nextSettings.entryValue,
      cycle_minutes: robotConfigState.cycleMinutes,
      stop_win: nextSettings.stopWin,
      stop_loss: nextSettings.stopLoss,
      martingale_enabled: nextSettings.martingaleEnabled,
      martingale_steps: 1,
      martingale_multiplier: nextSettings.martingaleMultiplier,
    });
    if (!response.ok) {
      throw new ApiError(response.error, response.code);
    }

    await queryClient.refetchQueries({
      queryKey: ["robot-state", userId],
      exact: true,
    });
  }

  return { settings, setSettings, saveSettings };
}
