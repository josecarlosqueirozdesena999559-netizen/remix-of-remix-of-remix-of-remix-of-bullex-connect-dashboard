export type RobotSettings = {
  entryValue: number;
  stopWin: number;
  stopLoss: number;
  martingaleEnabled: boolean;
  martingaleMultiplier: number;
  narratorEnabled: boolean;
};

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  entryValue: 2,
  stopWin: 50,
  stopLoss: 30,
  martingaleEnabled: false,
  martingaleMultiplier: 2,
  narratorEnabled: true,
};

let currentSettings = DEFAULT_ROBOT_SETTINGS;
let settingsUserId: string | null = null;
let pendingConfig: {
  userId: string;
  entryValue: number;
  stopWin: number;
  stopLoss: number;
  martingaleEnabled: boolean;
  martingaleMultiplier: number;
  savedAt: number;
} | null = null;
const listeners = new Set<() => void>();
const CONFIG_CONFIRMATION_TIMEOUT_MS = 10_000;

export function readRobotSettings(userId?: string): RobotSettings {
  return userId && settingsUserId === userId ? currentSettings : DEFAULT_ROBOT_SETTINGS;
}

export function saveRobotSettings(userId: string, settings: RobotSettings) {
  settingsUserId = userId;
  currentSettings = normalizeRobotSettings(settings);
  emitChange();
}

export function markRobotConfigPending(userId: string, settings: RobotSettings) {
  settingsUserId = userId;
  currentSettings = normalizeRobotSettings(settings);
  pendingConfig = {
    userId,
    entryValue: currentSettings.entryValue,
    stopWin: currentSettings.stopWin,
    stopLoss: currentSettings.stopLoss,
    martingaleEnabled: currentSettings.martingaleEnabled,
    martingaleMultiplier: currentSettings.martingaleMultiplier,
    savedAt: Date.now(),
  };
  emitChange();
}

export function syncRobotSettings(
  userId: string,
  settings: {
    entryValue: number | null;
    stopWin: number | null;
    stopLoss: number | null;
    martingaleEnabled?: boolean | null;
    martingaleMultiplier?: number | null;
  },
) {
  const previous = readRobotSettings(userId);
  const backendHasConfig =
    settings.entryValue != null && settings.stopWin != null && settings.stopLoss != null;

  if (pendingConfig?.userId === userId && backendHasConfig) {
    const backendMartingaleEnabled = settings.martingaleEnabled ?? pendingConfig.martingaleEnabled;
    const backendMartingaleMultiplier =
      settings.martingaleMultiplier ?? pendingConfig.martingaleMultiplier;
    const backendConfirmed =
      settings.entryValue === pendingConfig.entryValue &&
      settings.stopWin === pendingConfig.stopWin &&
      settings.stopLoss === pendingConfig.stopLoss &&
      backendMartingaleEnabled === pendingConfig.martingaleEnabled &&
      backendMartingaleMultiplier === pendingConfig.martingaleMultiplier;

    if (backendConfirmed) {
      pendingConfig = null;
    } else if (Date.now() - pendingConfig.savedAt < CONFIG_CONFIRMATION_TIMEOUT_MS) {
      return;
    } else {
      pendingConfig = null;
    }
  }

  const next = normalizeRobotSettings({
    ...previous,
    entryValue: settings.entryValue ?? previous.entryValue,
    stopWin: settings.stopWin ?? previous.stopWin,
    stopLoss: settings.stopLoss ?? previous.stopLoss,
    martingaleEnabled: settings.martingaleEnabled ?? previous.martingaleEnabled,
    martingaleMultiplier: settings.martingaleMultiplier ?? previous.martingaleMultiplier,
  });

  if (
    settingsUserId === userId &&
    currentSettings.entryValue === next.entryValue &&
    currentSettings.stopWin === next.stopWin &&
    currentSettings.stopLoss === next.stopLoss &&
    currentSettings.martingaleEnabled === next.martingaleEnabled &&
    currentSettings.martingaleMultiplier === next.martingaleMultiplier
  ) {
    return;
  }

  settingsUserId = userId;
  currentSettings = next;
  emitChange();
}

export function resetRobotSettings() {
  settingsUserId = null;
  currentSettings = DEFAULT_ROBOT_SETTINGS;
  pendingConfig = null;
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
    martingaleEnabled:
      settings?.martingaleEnabled === true ||
      (settings as { g1?: boolean } | null | undefined)?.g1 === true,
    martingaleMultiplier: positiveNumber(
      settings?.martingaleMultiplier,
      DEFAULT_ROBOT_SETTINGS.martingaleMultiplier,
    ),
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
