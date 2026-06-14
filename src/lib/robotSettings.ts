export type RobotSettings = {
  entryValue: number;
  stopWin: number;
  stopLoss: number;
  g1: boolean;
  narratorEnabled: boolean;
};

export const ROBOT_SETTINGS_KEY = "robot-settings";
export const ROBOT_SETTINGS_EVENT = "robot-settings-changed";

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  entryValue: 2,
  stopWin: 50,
  stopLoss: 30,
  g1: false,
  narratorEnabled: false,
};

export function readRobotSettings(): RobotSettings {
  if (typeof window === "undefined") return DEFAULT_ROBOT_SETTINGS;

  try {
    const raw = JSON.parse(window.localStorage.getItem(ROBOT_SETTINGS_KEY) ?? "null") as
      | Partial<RobotSettings>
      | null;

    return normalizeRobotSettings(raw);
  } catch {
    return DEFAULT_ROBOT_SETTINGS;
  }
}

export function saveRobotSettings(settings: RobotSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROBOT_SETTINGS_KEY, JSON.stringify(normalizeRobotSettings(settings)));
  window.dispatchEvent(new Event(ROBOT_SETTINGS_EVENT));
}

export function normalizeRobotSettings(settings?: Partial<RobotSettings> | null): RobotSettings {
  return {
    entryValue: positiveNumber(settings?.entryValue, DEFAULT_ROBOT_SETTINGS.entryValue),
    stopWin: positiveNumber(settings?.stopWin, DEFAULT_ROBOT_SETTINGS.stopWin),
    stopLoss: positiveNumber(settings?.stopLoss, DEFAULT_ROBOT_SETTINGS.stopLoss),
    g1: settings?.g1 === true,
    narratorEnabled: settings?.narratorEnabled === true,
  };
}

function positiveNumber(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}
