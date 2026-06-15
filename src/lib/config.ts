const REQUIRED_API_BASE_URL = "https://api.elcapobot.online";

function resolveApiBaseUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, "") ?? "";

  if (!normalized) {
    return REQUIRED_API_BASE_URL;
  }

  try {
    const url = new URL(normalized);
    const isSecure = url.protocol === "https:";
    const isExpectedHost = url.hostname === "api.elcapobot.online";

    if (isSecure && isExpectedHost) {
      return REQUIRED_API_BASE_URL;
    }
  } catch {
    // Fall through to the required API base URL.
  }

  return REQUIRED_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

console.log("[API_BASE_URL]");
console.log(API_BASE_URL);
