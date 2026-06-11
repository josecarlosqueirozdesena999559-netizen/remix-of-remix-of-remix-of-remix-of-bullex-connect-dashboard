const KEY = "bullex_trial_start";
const DAYS = 3;
export const TRIAL_MS = DAYS * 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = DAYS;
export const TRIAL_DISCOUNT = 15;

export function initTrial(force = false) {
  if (typeof window === "undefined") return;
  if (force || !localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, String(Date.now()));
  }
}

export function getTrialStart(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v ? Number(v) : null;
}

export function getTrialRemainingMs(): number {
  const start = getTrialStart();
  if (!start) return 0;
  return Math.max(0, start + TRIAL_MS - Date.now());
}

export function formatRemaining(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
