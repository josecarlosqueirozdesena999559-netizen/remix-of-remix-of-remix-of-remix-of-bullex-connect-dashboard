export type RobotSettings = {
  entryValue: number;
  stopWin: number;
  stopLoss: number;
  martingaleEnabled: boolean;
  martingaleSteps: number;
  martingaleMultiplier: number;
  aiAnalysisEnabled: boolean;
  aiConfirmationRequired: boolean;
  aiMinConfidence: number;
  narratorEnabled: boolean;
};

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  entryValue: 2,
  stopWin: 50,
  stopLoss: 30,
  martingaleEnabled: false,
  martingaleSteps: 1,
  martingaleMultiplier: 2,
  aiAnalysisEnabled: false,
  aiConfirmationRequired: false,
  aiMinConfidence: 80,
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
  martingaleSteps: number;
  martingaleMultiplier: number;
  aiAnalysisEnabled: boolean;
  aiConfirmationRequired: boolean;
  aiMinConfidence: number;
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
    martingaleSteps: currentSettings.martingaleSteps,
    martingaleMultiplier: currentSettings.martingaleMultiplier,
    aiAnalysisEnabled: currentSettings.aiAnalysisEnabled,
    aiConfirmationRequired: currentSettings.aiConfirmationRequired,
    aiMinConfidence: currentSettings.aiMinConfidence,
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
    martingaleSteps?: number | null;
    martingaleMultiplier?: number | null;
    aiAnalysisEnabled?: boolean | null;
    aiConfirmationRequired?: boolean | null;
    aiMinConfidence?: number | null;
  },
) {
  const previous = readRobotSettings(userId);
  const backendHasConfig =
    settings.entryValue != null && settings.stopWin != null && settings.stopLoss != null;

  if (pendingConfig?.userId === userId && backendHasConfig) {
    const backendMartingaleEnabled = settings.martingaleEnabled ?? pendingConfig.martingaleEnabled;
    const backendMartingaleSteps = settings.martingaleSteps ?? pendingConfig.martingaleSteps;
    const backendMartingaleMultiplier =
      settings.martingaleMultiplier ?? pendingConfig.martingaleMultiplier;
    const backendAiAnalysisEnabled =
      settings.aiAnalysisEnabled ?? pendingConfig.aiAnalysisEnabled;
    const backendAiConfirmationRequired =
      settings.aiConfirmationRequired ?? pendingConfig.aiConfirmationRequired;
    const backendAiMinConfidence = settings.aiMinConfidence ?? pendingConfig.aiMinConfidence;
    const backendConfirmed =
      settings.entryValue === pendingConfig.entryValue &&
      settings.stopWin === pendingConfig.stopWin &&
      settings.stopLoss === pendingConfig.stopLoss &&
      backendMartingaleEnabled === pendingConfig.martingaleEnabled &&
      backendMartingaleSteps === pendingConfig.martingaleSteps &&
      backendMartingaleMultiplier === pendingConfig.martingaleMultiplier &&
      backendAiAnalysisEnabled === pendingConfig.aiAnalysisEnabled &&
      backendAiConfirmationRequired === pendingConfig.aiConfirmationRequired &&
      backendAiMinConfidence === pendingConfig.aiMinConfidence;

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
    martingaleSteps: settings.martingaleSteps ?? previous.martingaleSteps,
    martingaleMultiplier: settings.martingaleMultiplier ?? previous.martingaleMultiplier,
    aiAnalysisEnabled: settings.aiAnalysisEnabled ?? previous.aiAnalysisEnabled,
    aiConfirmationRequired:
      settings.aiConfirmationRequired ?? previous.aiConfirmationRequired,
    aiMinConfidence: settings.aiMinConfidence ?? previous.aiMinConfidence,
  });

  if (
    settingsUserId === userId &&
    currentSettings.entryValue === next.entryValue &&
    currentSettings.stopWin === next.stopWin &&
    currentSettings.stopLoss === next.stopLoss &&
    currentSettings.martingaleEnabled === next.martingaleEnabled &&
    currentSettings.martingaleSteps === next.martingaleSteps &&
    currentSettings.martingaleMultiplier === next.martingaleMultiplier &&
    currentSettings.aiAnalysisEnabled === next.aiAnalysisEnabled &&
    currentSettings.aiConfirmationRequired === next.aiConfirmationRequired &&
    currentSettings.aiMinConfidence === next.aiMinConfidence
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
    martingaleSteps: positiveInteger(
      settings?.martingaleSteps,
      DEFAULT_ROBOT_SETTINGS.martingaleSteps,
    ),
    martingaleMultiplier: positiveNumber(
      settings?.martingaleMultiplier,
      DEFAULT_ROBOT_SETTINGS.martingaleMultiplier,
    ),
    aiAnalysisEnabled:
      typeof settings?.aiAnalysisEnabled === "boolean"
        ? settings.aiAnalysisEnabled
        : DEFAULT_ROBOT_SETTINGS.aiAnalysisEnabled,
    aiConfirmationRequired:
      typeof settings?.aiConfirmationRequired === "boolean"
        ? settings.aiConfirmationRequired
        : DEFAULT_ROBOT_SETTINGS.aiConfirmationRequired,
    aiMinConfidence: positiveNumber(
      settings?.aiMinConfidence,
      DEFAULT_ROBOT_SETTINGS.aiMinConfidence,
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

function positiveInteger(value: unknown, fallback: number) {
  return Math.max(1, Math.floor(positiveNumber(value, fallback)));
}

function emitChange() {
  listeners.forEach((listener) => listener());
}
