import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/useAuth";

export type MarketSocketStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type MarketSocketCandleMessage = {
  type: "candle";
  active: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type MarketSocketErrorMessage = {
  type: "error";
  error?: string;
};

type MarketSocketMessage = MarketSocketCandleMessage | MarketSocketErrorMessage;

type UseMarketSocketParams = {
  active: string | null;
  enabled: boolean;
  onCandle: (message: MarketSocketCandleMessage) => void;
  onStatus: (status: MarketSocketStatus) => void;
};

const API_KEY = import.meta.env.VITE_PANEL_API_KEY ?? "";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function useMarketSocket({
  active,
  enabled,
  onCandle,
  onStatus,
}: UseMarketSocketParams) {
  const { user } = useAuth();
  const [status, setStatus] = useState<MarketSocketStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(false);
  const connectionKeyRef = useRef<string>("");
  const onCandleRef = useRef(onCandle);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onCandleRef.current = onCandle;
  }, [onCandle]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const updateStatus = (nextStatus: MarketSocketStatus) => {
      setStatus(nextStatus);
      onStatusRef.current?.(nextStatus);
    };

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current != null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const cleanupSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };

    if (!enabled || !active || !user?.id || !API_KEY || !API_BASE_URL) {
      shouldReconnectRef.current = false;
      clearReconnectTimeout();
      cleanupSocket();
      connectionKeyRef.current = "";
      setLastError(null);
      updateStatus("disconnected");
      return;
    }

    shouldReconnectRef.current = true;
    const connectionKey = `${user.id}:${active}`;
    connectionKeyRef.current = connectionKey;

    const connect = () => {
      if (connectionKeyRef.current !== connectionKey) return;
      clearReconnectTimeout();
      const base = API_BASE_URL.replace(/^http/i, "ws").replace(/\/$/, "");
      const url = `${base}/ws/market?user_id=${encodeURIComponent(user.id)}&active=${encodeURIComponent(active)}&api_key=${encodeURIComponent(API_KEY)}`;

      console.log("[MARKET WS USER_ID]", user.id);
      console.log("[MARKET WS CONNECTING]", { active, userId: user.id });
      updateStatus(socketRef.current ? "reconnecting" : "connecting");

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("[MARKET WS CONNECTED]", { active });
        setLastError(null);
        updateStatus("connected");
      };

      socket.onmessage = (event) => {
        console.log("[MARKET WS MESSAGE]", event.data);

        try {
          const message = JSON.parse(event.data) as MarketSocketMessage;
          if (message.type === "candle") {
            onCandleRef.current(message);
            return;
          }

          if (message.type === "error") {
            setLastError(message.error ?? "Erro desconhecido");
            updateStatus("error");
          }
        } catch {
          setLastError("Mensagem invalida do WebSocket");
          updateStatus("error");
        }
      };

      socket.onerror = () => {
        console.log("[MARKET WS ERROR]", { active });
        setLastError("Falha na conexao WebSocket");
        updateStatus("error");
      };

      socket.onclose = () => {
        console.log("[MARKET WS DISCONNECTED]", { active });
        socketRef.current = null;

        if (!shouldReconnectRef.current || connectionKeyRef.current !== connectionKey) {
          updateStatus("disconnected");
          return;
        }

        updateStatus("reconnecting");
        console.log("[MARKET WS RECONNECTING]", { active });
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      connectionKeyRef.current = "";
      clearReconnectTimeout();
      cleanupSocket();
      updateStatus("disconnected");
    };
  }, [active, enabled, user?.id]);

  return { status, lastError, userId: user?.id ?? null };
}
