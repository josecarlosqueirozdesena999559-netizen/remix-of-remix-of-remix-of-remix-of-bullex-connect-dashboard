import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";
import type { RecentRobotResult } from "@/hooks/useRecentRobotResult";

export type RobotPresentation = {
  kind: "loading" | "stopped" | "analyzing" | "operation" | "result";
  title: string;
  detail: string | null;
  footer: string | null;
  signal: RobotSignal | null;
  trade: RobotTrade | null;
  direction: RobotDirection | null;
};

export function getRobotPresentation(
  robotState: RobotState | undefined,
  recentResult: RecentRobotResult,
  now: number,
): RobotPresentation {
  if (!robotState) {
    return createPresentation("loading", "Consultando robô...");
  }

  if (!robotState.enabled || robotState.status === "STOPPED") {
    return createPresentation(
      "stopped",
      "Robô parado",
      robotState.disconnected ? "Conta BullEx desconectada" : null,
    );
  }

  const trade = robotState.last_trade;

  if (trade && recentResult) {
    return {
      ...createPresentation("result", recentResult === "WIN" ? "WIN ✅" : "LOSS ❌"),
      trade,
      direction: trade.direction,
    };
  }

  if (
    robotState.operation_in_progress ||
    robotState.status === "PENDING_RESULT" ||
    robotState.last_trade?.result === "PENDING_RESULT"
  ) {
    return {
      ...createPresentation("operation", "Operação em andamento"),
      trade,
      direction: trade?.direction ?? null,
    };
  }

  if (robotState.status === "ERROR") {
    return createPresentation(
      "analyzing",
      "Erro no robô",
      robotState.rejection_reason ?? "Não foi possível concluir o ciclo.",
    );
  }

  if (robotState.status === "SIGNAL_REJECTED") {
    return createPresentation(
      "analyzing",
      "Analisando...",
      robotState.rejection_reason ? `Motivo: ${robotState.rejection_reason}` : null,
      getNextCycleFooter(robotState, now),
    );
  }

  if (robotState.status === "WAITING_NEXT_CYCLE") {
    const remainingSeconds = getCycleRemainingSeconds(robotState, now);
    return createPresentation(
      "analyzing",
      remainingSeconds > 0 ? "Aguardando próxima análise" : "Analisando...",
      null,
      remainingSeconds > 0 ? `Próxima entrada em ${formatDuration(remainingSeconds)}` : null,
    );
  }

  if (robotState.status === "SIGNAL_SELECTED" && robotState.last_signal) {
    return {
      ...createPresentation("analyzing", "Analisando sinal..."),
      signal: robotState.last_signal,
      direction: robotState.last_signal.direction,
    };
  }

  return createPresentation("analyzing", "Analisando...");
}

export function getCycleRemainingSeconds(robotState: RobotState, now: number) {
  const nextCycleAt = parseDate(robotState.next_cycle_at);
  if (nextCycleAt != null) {
    return Math.max(0, Math.ceil((nextCycleAt - now) / 1000));
  }

  const elapsed = Math.floor((now - robotState.fetched_at) / 1000);
  return Math.max(0, Math.ceil(robotState.seconds_until_next_cycle - elapsed));
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function createPresentation(
  kind: RobotPresentation["kind"],
  title: string,
  detail: string | null = null,
  footer: string | null = null,
): RobotPresentation {
  return {
    kind,
    title,
    detail,
    footer,
    signal: null,
    trade: null,
    direction: null,
  };
}

function getNextCycleFooter(robotState: RobotState, now: number) {
  const remainingSeconds = getCycleRemainingSeconds(robotState, now);
  return remainingSeconds > 0 ? `Próxima entrada em ${formatDuration(remainingSeconds)}` : null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasTimezone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}
