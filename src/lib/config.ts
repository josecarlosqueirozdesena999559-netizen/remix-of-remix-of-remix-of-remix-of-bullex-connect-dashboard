const DEFAULT_API_BASE_URL = "https://api.elcapobot.online";
const DEFAULT_WS_BASE_URL = "wss://api.elcapobot.online";

function normalizeBaseUrl(value: string | undefined, fallback: string, label: string) {
  const normalized = value?.trim().replace(/\/+$/, "");

  if (!normalized) {
    console.warn(`[config] ${label} not set, using fallback`, fallback);
    return fallback;
  }

  if (normalized === fallback) {
    return normalized;
  }

  console.warn(`[config] ${label} invalid, using fallback`, normalized);
  return fallback;
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  DEFAULT_API_BASE_URL,
  "VITE_API_BASE_URL",
);

export const WS_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_WS_URL,
  DEFAULT_WS_BASE_URL,
  "VITE_WS_URL",
);

console.log("API_BASE_URL", API_BASE_URL);
console.log("WS_BASE_URL", WS_BASE_URL);
