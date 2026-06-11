import { supabase } from "@/lib/supabase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API_KEY = import.meta.env.VITE_PANEL_API_KEY ?? "";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_API_KEY: "Erro de configuração da API",
  SESSION_NOT_FOUND: "Conta BullEx desconectada",
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
  if (!BASE_URL) {
    return { ok: false, error: "VITE_API_BASE_URL não configurada", code: "NO_BACKEND" };
  }

  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Não autenticado", code: "NO_AUTH" };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-user-id": userId,
        ...(init.headers ?? {}),
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
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

export const bullexApi = {
  connect: (payload: { email: string; password: string; sms_code?: string }) =>
    apiRequest<{ ok: boolean }>("/bullex/connect", { method: "POST", body: JSON.stringify(payload) }),
  disconnect: () => apiRequest<{ ok: boolean }>("/bullex/disconnect", { method: "POST" }),
  reconnect: () => apiRequest<{ ok: boolean }>("/bullex/reconnect", { method: "POST" }),
  status: () => apiRequest<{ status: string }>("/bullex/status"),
  account: () => apiRequest<BullexAccount>("/bullex/account"),
  balance: () => apiRequest<{ balance: number; currency: string }>("/bullex/balance"),
};

export const apiConfig = { BASE_URL, hasKey: !!API_KEY };
