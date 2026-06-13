import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/config";

const API_KEY = import.meta.env.VITE_PANEL_API_KEY ?? "";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_API_KEY: "Erro de configuração da API",
  SESSION_NOT_FOUND: "Conta BullEx desconectada. Clique em Conectar BullEx.",
  SESSION_DISCONNECTED: "Conta BullEx desconectada. Clique em Conectar BullEx.",
  invalid_credentials: "Email ou senha BullEx inválidos",
};

export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function getApiErrorMessage(codeOrMessage?: string, fallback = "Erro inesperado") {
  if (!codeOrMessage) return fallback;
  return ERROR_MESSAGES[codeOrMessage] ?? codeOrMessage;
}

export function isKnownApiError(codeOrMessage?: string) {
  return !!codeOrMessage && codeOrMessage in ERROR_MESSAGES;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  if (!API_BASE_URL) {
    return { ok: false, error: "VITE_API_BASE_URL não configurada", code: "NO_BACKEND" };
  }

  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Não autenticado", code: "NO_AUTH" };

  if (path === "/bullex/connect") {
    console.log("[BULLEX CONNECT USER_ID]", userId);
  } else if (path === "/bullex/account") {
    console.log("[BULLEX ACCOUNT USER_ID]", userId);
  }

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        "x-api-key": API_KEY,
        "x-user-id": userId,
      },
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (json?.ok === false) {
      const code = json?.code ?? json?.error;
      return {
        ok: false,
        error: getApiErrorMessage(code, json?.message ?? json?.error ?? "Erro na API"),
        code,
      };
    }

    if (!res.ok) {
      const code = json?.code ?? json?.error;
      return {
        ok: false,
        error: getApiErrorMessage(code, json?.message ?? `Erro ${res.status}`),
        code,
      };
    }

    return { ok: true, data: (json?.ok === true && "data" in json ? json.data : json) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro de rede" };
  }
}

export interface BullexAccount {
  ok?: boolean;
  connected?: boolean;
  status?: "connected" | "disconnected";
  mode?: "PRACTICE" | "REAL";
  balance?: number;
  currency?: string;
  email?: string;
  dayResult?: "WIN" | "LOSS" | null;
  dayProfit?: number;
}

export type RobotConfigPayload = {
  enabled: boolean;
  account_mode?: "DEMO" | "REAL";
  allow_real?: boolean;
  confirm_real?: boolean;
  entry_value?: number;
  cycle_minutes?: number;
  min_confidence?: number;
  min_payout?: number;
  stop_win?: number;
  stop_loss?: number;
};

export function robotConfig(payload: RobotConfigPayload) {
  return apiRequest<unknown>("/robot/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function robotStart() {
  return apiRequest<unknown>("/robot/start", { method: "POST" });
}

export function robotState() {
  return apiRequest<unknown>("/robot/state");
}

export const bullexApi = {
  connect: (payload: { email: string; password: string; sms_code?: string }) =>
    apiRequest<{ ok: boolean }>("/bullex/connect", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  disconnect: () => apiRequest<{ ok: boolean }>("/bullex/disconnect", { method: "POST" }),
  reconnect: () => apiRequest<{ ok: boolean }>("/bullex/reconnect", { method: "POST" }),
  status: () => apiRequest<{ status: string }>("/bullex/status"),
  account: () => apiRequest<BullexAccount>("/bullex/account"),
  balance: () => apiRequest<{ balance: number; currency: string }>("/bullex/balance"),
};

export const apiConfig = { BASE_URL: API_BASE_URL, hasKey: !!API_KEY };
