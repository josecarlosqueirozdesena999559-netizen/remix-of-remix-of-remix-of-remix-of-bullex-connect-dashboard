import { supabase } from "@/integrations/supabase/client";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API_KEY = import.meta.env.VITE_PANEL_API_KEY ?? "";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
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
    if (!res.ok) {
      return { ok: false, error: json?.message ?? `Erro ${res.status}`, code: json?.code };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

export interface BullexAccount {
  status: "connected" | "disconnected";
  mode?: "PRACTICE" | "REAL";
  balance?: number;
  currency?: string;
  dayResult?: "WIN" | "LOSS" | null;
  dayProfit?: number;
}

export const bullexApi = {
  connect: (payload: { email: string; password: string; otp?: string }) =>
    request<{ ok: boolean }>("/bullex/connect", { method: "POST", body: JSON.stringify(payload) }),
  disconnect: () => request<{ ok: boolean }>("/bullex/disconnect", { method: "POST" }),
  reconnect: () => request<{ ok: boolean }>("/bullex/reconnect", { method: "POST" }),
  status: () => request<{ status: string }>("/bullex/status"),
  account: () => request<BullexAccount>("/bullex/account"),
  balance: () => request<{ balance: number; currency: string }>("/bullex/balance"),
};

export const apiConfig = { BASE_URL, hasKey: !!API_KEY };
