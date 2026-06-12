import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { RobotOverlay, type RobotOverlaySignal } from "@/components/RobotOverlay";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { ApiError, apiRequest, type ApiResult } from "@/lib/api";

export function FloatingRobot({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const account = useBullExAccount();
  const visibilityKey = `robot-overlay-visible:${userId ?? "anonymous"}`;
  const positionKey = `robot-overlay-position:${userId ?? "anonymous"}`;
  const [visible, setVisible] = useState(() => readVisibility(visibilityKey));

  useEffect(() => {
    setVisible(readVisibility(visibilityKey));
  }, [visibilityKey]);

  const signalsQuery = useQuery({
    queryKey: ["signals", "scan", userId],
    queryFn: async () => {
      const response = await apiRequest<unknown>("/signals/scan");
      const bestSignal = getBestSignal(unwrap(response));
      console.log("[ROBOT OVERLAY SIGNAL]", bestSignal);
      return bestSignal;
    },
    enabled: account.data?.connected === true && !!userId,
    refetchInterval: 5000,
    retry: 1,
    staleTime: 4000,
  });

  const signal =
    signalsQuery.data && signalsQuery.data.confidence >= 70 && signalsQuery.data.signal !== "WAIT"
      ? signalsQuery.data
      : undefined;

  function setOverlayVisible(nextVisible: boolean) {
    setVisible(nextVisible);
    localStorage.setItem(visibilityKey, String(nextVisible));
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setOverlayVisible(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur transition hover:bg-accent"
      >
        <Bot className="h-4 w-4 text-primary" />
        Mostrar robô
      </button>
    );
  }

  return (
    <RobotOverlay
      winCount={0}
      lossCount={0}
      status={signal ? "Sinal encontrado" : "Analisando..."}
      signal={signal}
      storageKey={positionKey}
      onClose={() => setOverlayVisible(false)}
      onConfig={() => void navigate({ to: "/robot" })}
    />
  );
}

function readVisibility(storageKey: string) {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(storageKey) !== "false";
}

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new ApiError(result.error, result.code);
  return result.data;
}

function getBestSignal(input: unknown): RobotOverlaySignal | undefined {
  return getSignalRows(input)
    .map(normalizeSignal)
    .filter((signal): signal is RobotOverlaySignal => signal != null)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function getSignalRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];

  const value = input as Record<string, unknown>;
  if (Array.isArray(value.signals)) return value.signals;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.result)) return value.result;
  if (value.best_signal && typeof value.best_signal === "object") return [value.best_signal];
  if (value.signal && typeof value.signal === "object") return [value.signal];
  if (typeof value.signal === "string") return [value];
  return [];
}

function normalizeSignal(input: unknown): RobotOverlaySignal | null {
  if (!input || typeof input !== "object") return null;

  const value = input as Record<string, unknown>;
  const symbol = String(value.symbol ?? value.active ?? value.asset ?? "").trim();
  const direction = String(value.signal ?? value.direction ?? value.type ?? "WAIT").toUpperCase();
  const confidenceValue = normalizeNumber(value.confidence ?? value.score ?? value.probability);
  const confidence = confidenceValue == null ? 0 : confidenceValue <= 1 ? confidenceValue * 100 : confidenceValue;

  if (!symbol || !["CALL", "PUT", "WAIT"].includes(direction)) return null;

  return {
    symbol,
    signal: direction as RobotOverlaySignal["signal"],
    confidence,
    last_price: normalizeNumber(value.last_price ?? value.lastPrice ?? value.price) ?? undefined,
  };
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}
