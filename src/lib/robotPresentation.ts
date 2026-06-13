import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type RobotResult = "WIN" | "LOSS" | null;

export type RobotPresentation = {
  kind: "loading" | "stopped" | "analyzing" | "entry" | "operation" | "result";
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

  const trade = robotState.last_trade;
  const operationInProgress =
    robotState.operation_in_progress ||
    robotState.status === "PENDING_RESULT" ||
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
      direction: trade?.direction ?? null,
    };
  }

  if (robotState.entry_window_open) {
    return {
      ...createPresentation("entry", "Entrada liberada", "Enviando ordem..."),
      signal: robotState.last_signal,
      direction: robotState.last_signal?.direction ?? null,
    };
  }

  const result = trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;
  if (trade && result) {
    return {
      ...createPresentation("result", result),
      trade,
      direction: trade.direction,
      result,
    };
  }

  if (robotState.status === "WAITING_ENTRY_WINDOW") {
    const remainingSeconds = getRemainingSeconds(
      robotState.seconds_until_entry_window,
      robotState.fetched_at,
      now,
    );
    return createPresentation(
      "analyzing",
      "Sinal encontrado",
      "Aguardando janela de entrada",
      `Entrada em ${formatDuration(remainingSeconds)}`,
    );
  }

  if (robotState.status === "WAITING_NEXT_CYCLE") {
    const remainingSeconds = getRemainingSeconds(
      robotState.seconds_until_next_cycle,
      robotState.fetched_at,
      now,
    );
    return createPresentation(
      "analyzing",
      "Analisando...",
      `Próxima análise em ${formatDuration(remainingSeconds)}`,
    );
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
