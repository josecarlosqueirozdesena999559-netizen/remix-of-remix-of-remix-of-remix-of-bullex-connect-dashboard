import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/config";

const API_KEY = import.meta.env.VITE_PANEL_API_KEY ?? "";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; status?: number };

export type AdminPlanStatus = "active" | "expired" | "trial" | "canceled";

export type AdminCreateUserPayload = {
  name: string;
  email: string;
  password: string;
  plan_name?: string;
  amount?: number;
  currency?: string;
  status?: AdminPlanStatus;
  started_at?: string | null;
  expires_at?: string | null;
  next_billing_at?: string | null;
  grant_access?: boolean;
  is_admin?: boolean;
};

export type AdminUpdateUserPayload = {
  name?: string;
  email?: string;
  password?: string;
  plan_name?: string;
  amount?: number;
  currency?: string;
  status?: AdminPlanStatus;
  started_at?: string | null;
  expires_at?: string | null;
  next_billing_at?: string | null;
  grant_access?: boolean;
  reset_monthly_cycle?: boolean;
  is_admin?: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_API_KEY: "Erro de configuração da API",
  SESSION_NOT_FOUND: "Conta BullEx desconectada. Clique em Conectar BullEx.",
  SESSION_DISCONNECTED: "Conta BullEx desconectada. Clique em Conectar BullEx.",
  invalid_credentials: "Email ou senha BullEx inválidos",
};

export class ApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function getApiErrorMessage(codeOrMessage?: string, fallback = "Erro inesperado") {
  if (!codeOrMessage) return fallback;
  if (ERROR_MESSAGES[codeOrMessage]) return ERROR_MESSAGES[codeOrMessage];
  return fallback !== "Erro inesperado" ? fallback : codeOrMessage;
}

export function isKnownApiError(codeOrMessage?: string) {
  return !!codeOrMessage && codeOrMessage in ERROR_MESSAGES;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  expectedUserId?: string,
): Promise<ApiResult<T>> {
  if (!API_BASE_URL) {
    return { ok: false, error: "VITE_API_BASE_URL não configurada", code: "NO_BACKEND" };
  }

  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Não autenticado", code: "NO_AUTH" };
  if (expectedUserId && expectedUserId !== userId) {
    return { ok: false, error: "Sessão de usuário alterada", code: "AUTH_USER_CHANGED" };
  }

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
        status: res.status,
      };
    }

    if (!res.ok) {
      const code = json?.code ?? json?.error;
      return {
        ok: false,
        error: getApiErrorMessage(code, json?.message ?? `Erro ${res.status}`),
        code,
        status: res.status,
      };
    }

    return { ok: true, data: (json?.ok === true && "data" in json ? json.data : json) as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Tempo esgotado ao conectar. Tente novamente.", code: "TIMEOUT" };
    }

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

export type BullexConnectResponse = {
  ok?: boolean;
  connected?: boolean;
  status?: string;
};

export type BullexAccountMode = "PRACTICE" | "REAL";
export type ChangeBullexModePayload = {
  mode: BullexAccountMode;
  confirm_real?: boolean;
};

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
  martingale_enabled?: boolean;
  martingale_steps?: number;
  martingale_multiplier?: number;
  ai_analysis_enabled?: boolean;
  ai_confirmation_required?: boolean;
  ai_min_confidence?: number;
};

export type BullexBuyRealPayload = {
  asset_id: string;
  direction: "CALL" | "PUT";
  amount: number;
  duration: number;
  confirm_real: true;
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

export function robotStop() {
  return apiRequest<unknown>("/robot/stop", { method: "POST" });
}

export function robotResetCycle() {
  return apiRequest<unknown>("/robot/reset-cycle", { method: "POST" });
}

export function robotState(userId: string) {
  return apiRequest<unknown>("/robot/state", {}, userId);
}

export function robotSyncConnection() {
  return apiRequest<{ ok: boolean }>("/robot/sync-connection", { method: "POST" });
}

export function buyReal(payload: BullexBuyRealPayload) {
  return apiRequest<unknown>("/bullex/buy-real", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminOverview() {
  return apiRequest<unknown>("/admin/overview");
}

export function adminCreateUser(payload: AdminCreateUserPayload) {
  return apiRequest<unknown>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminUpdateUser(userId: string, payload: AdminUpdateUserPayload) {
  return apiRequest<unknown>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export const bullexApi = {
  connect: (
    payload: { email: string; password: string; sms_code?: string },
    options?: { signal?: AbortSignal },
  ) =>
    apiRequest<BullexConnectResponse>(
      "/bullex/connect",
      {
        method: "POST",
        body: JSON.stringify(payload),
        signal: options?.signal,
      },
    ),
  disconnect: () => apiRequest<{ ok: boolean }>("/bullex/disconnect", { method: "POST" }),
  reconnect: () => apiRequest<{ ok: boolean }>("/bullex/reconnect", { method: "POST" }),
  changeMode: (payload: BullexAccountMode | ChangeBullexModePayload) =>
    apiRequest<{ ok: boolean }>("/bullex/change-mode", {
      method: "POST",
      body: JSON.stringify(typeof payload === "string" ? { mode: payload } : payload),
    }),
  status: () => apiRequest<{ status: string }>("/bullex/status"),
  account: () => apiRequest<BullexAccount>("/bullex/account"),
  balance: () => apiRequest<{ balance: number; currency: string }>("/bullex/balance"),
};

export const apiConfig = { BASE_URL: API_BASE_URL, hasKey: !!API_KEY };
