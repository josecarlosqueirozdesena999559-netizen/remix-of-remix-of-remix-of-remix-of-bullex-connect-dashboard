export type RobotSettings = {
  entryValue: number;
  stopWin: number;
  stopLoss: number;
  g1: boolean;
  narratorEnabled: boolean;
};

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  entryValue: 2,
  stopWin: 50,
  stopLoss: 30,
  g1: false,
  narratorEnabled: true,
};

let currentSettings = DEFAULT_ROBOT_SETTINGS;
let settingsUserId: string | null = null;
const listeners = new Set<() => void>();

export function readRobotSettings(userId?: string): RobotSettings {
  return userId && settingsUserId === userId ? currentSettings : DEFAULT_ROBOT_SETTINGS;
}

export function saveRobotSettings(userId: string, settings: RobotSettings) {
  settingsUserId = userId;
  currentSettings = normalizeRobotSettings(settings);
  emitChange();
}

export function resetRobotSettings() {
  settingsUserId = null;
  currentSettings = DEFAULT_ROBOT_SETTINGS;
  emitChange();
}

export function subscribeRobotSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function normalizeRobotSettings(settings?: Partial<RobotSettings> | null): RobotSettings {
  return {
    entryValue: positiveNumber(settings?.entryValue, DEFAULT_ROBOT_SETTINGS.entryValue),
    stopWin: positiveNumber(settings?.stopWin, DEFAULT_ROBOT_SETTINGS.stopWin),
    stopLoss: positiveNumber(settings?.stopLoss, DEFAULT_ROBOT_SETTINGS.stopLoss),
    g1: settings?.g1 === true,
    narratorEnabled:
      typeof settings?.narratorEnabled === "boolean"
        ? settings.narratorEnabled
        : DEFAULT_ROBOT_SETTINGS.narratorEnabled,
  };
}

function positiveNumber(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}
