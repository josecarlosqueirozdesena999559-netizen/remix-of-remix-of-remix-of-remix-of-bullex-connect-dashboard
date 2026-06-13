import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type RobotResult = "WIN" | "LOSS" | null;
const RESULT_DISPLAY_MS = 5000;

export type RobotPresentation = {
  kind: "loading" | "stopped" | "analyzing" | "entry" | "operation" | "rejected" | "result";
  title: string;
  detail: string | null;
  footer: string | null;
  signal: RobotSignal | null;
  trade: RobotTrade | null;
  direction: RobotDirection | null;
  result: RobotResult;
};

export function getRobotPresentation(
  robotState: RobotState | undefined,
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

  const status = robotState.status;
  const trade = robotState.last_trade;
  const signal = robotState.pending_signal ?? robotState.last_signal;

  if (status === "ORDER_REJECTED" || trade?.result === "ORDER_REJECTED") {
    return {
      ...createPresentation(
        "rejected",
        "Entrada rejeitada",
        `Motivo: ${robotState.rejection_reason ?? "Ordem recusada pela corretora."}`,
      ),
      trade,
      signal,
      direction: trade?.direction ?? signal?.direction ?? null,
    };
  }

  if (status === "SENDING_ORDER") {
    return {
      ...createPresentation("operation", "Enviando ordem..."),
      trade,
      signal,
      direction: trade?.direction ?? signal?.direction ?? null,
    };
  }

  const operationInProgress =
    robotState.operation_in_progress ||
    status === "PENDING_RESULT" ||
    trade?.result === "PENDING_RESULT";

  if (operationInProgress) {
    return {
      ...createPresentation(
        "operation",
        "Operação em andamento",
        null,
        `Expira em ${formatDuration(getRemainingSeconds(robotState.expiration_seconds, robotState.fetched_at, now))}`,
      ),
      trade,
      signal: trade ? null : signal,
      direction: trade?.direction ?? signal?.direction ?? null,
    };
  }

  if (robotState.entry_window_open) {
    return {
      ...createPresentation("entry", "Entrada liberada", "Enviando ordem..."),
      signal,
      direction: signal?.direction ?? null,
    };
  }

  const result = trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;
  if (trade && result && isRecentResult(trade.finished_at, now)) {
    return {
      ...createPresentation("result", result),
      trade,
      direction: trade.direction,
      result,
    };
  }

  if (robotState.status === "WAITING_ENTRY_WINDOW") {
    if (!signal) {
      return createPresentation("analyzing", "Analisando...", "Nenhum sinal confirmado ainda");
    }

    const remainingSeconds = getRemainingSeconds(
      robotState.seconds_until_entry_window,
      robotState.fetched_at,
      now,
    );
    return {
      ...createPresentation(
        "analyzing",
        "Sinal encontrado",
        null,
        `Entrada em ${formatDuration(remainingSeconds)}`,
      ),
      signal,
      direction: signal.direction,
    };
  }

  if (robotState.status === "WAITING_NEXT_CYCLE") {
    return createNextCyclePresentation(robotState, now);
  }

  if (trade && result) {
    return createNextCyclePresentation(robotState, now);
  }

  if (robotState.status === "ERROR") {
    return createPresentation(
      "analyzing",
      "Erro no robô",
      robotState.rejection_reason ?? "Não foi possível concluir o ciclo.",
    );
  }

  return createPresentation("analyzing", "Analisando...", "Nenhum sinal confirmado ainda");
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function getRemainingSeconds(seconds: number, fetchedAt: number, now: number) {
  const elapsed = Math.floor((now - fetchedAt) / 1000);
  return Math.max(0, Math.ceil(seconds - elapsed));
}

function createNextCyclePresentation(robotState: RobotState, now: number) {
  const remainingSeconds = getRemainingSeconds(
    robotState.seconds_until_next_cycle,
    robotState.fetched_at,
    now,
  );
  return createPresentation(
    "analyzing",
    "Analisando...",
    `Próxima entrada em ${formatDuration(remainingSeconds)}`,
  );
}

function isRecentResult(finishedAt: string | null, now: number) {
  const finishedAtTime = parseDate(finishedAt);
  if (finishedAtTime == null) return false;
  const age = now - finishedAtTime;
  return age >= 0 && age < RESULT_DISPLAY_MS;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasTimezone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
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
    result: null,
  };
}
