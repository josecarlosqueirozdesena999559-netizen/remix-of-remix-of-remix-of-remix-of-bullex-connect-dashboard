import { useEffect, useState } from "react";
import {
  readRobotSettings,
  ROBOT_SETTINGS_EVENT,
  saveRobotSettings,
  type RobotSettings,
} from "@/lib/robotSettings";

export function useRobotSettings() {
  const [settings, setSettingsState] = useState<RobotSettings>(() => readRobotSettings());

  useEffect(() => {
    function syncSettings() {
      setSettingsState(readRobotSettings());
    }

    window.addEventListener(ROBOT_SETTINGS_EVENT, syncSettings);
    window.addEventListener("storage", syncSettings);
    return () => {
      window.removeEventListener(ROBOT_SETTINGS_EVENT, syncSettings);
      window.removeEventListener("storage", syncSettings);
    };
  }, []);

  function setSettings(nextSettings: RobotSettings) {
    const normalized = { ...nextSettings };
    setSettingsState(normalized);
    saveRobotSettings(normalized);
  }

  return { settings, setSettings };
}
