const DEFAULT_API_BASE_URL = "https://api.elcapobot.online";

function normalizeBaseUrl(value: string | undefined, fallback: string, label: string) {
  const normalized = value?.trim().replace(/\/+$/, "");

  if (!normalized) {
    console.warn(`[config] ${label} not set, using fallback`, fallback);
    return fallback;
  }

  try {
    const url = new URL(
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    console.warn(`[config] ${label} invalid, using fallback`, normalized);
    return fallback;
  }
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  DEFAULT_API_BASE_URL,
  "VITE_API_BASE_URL",
);

console.log("API_BASE_URL", API_BASE_URL);
