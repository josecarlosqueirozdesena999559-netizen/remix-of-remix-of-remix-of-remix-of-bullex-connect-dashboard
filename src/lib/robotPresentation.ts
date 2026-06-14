import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type RobotResult = "WIN" | "LOSS" | null;
const RESULT_DISPLAY_MS = 5000;
const REJECTION_DISPLAY_MS = 5000;
let orderRejectionSnapshot: OrderRejectionSnapshot | null = null;
let signalRejectionSnapshot: SignalRejectionSnapshot | null = null;

type OrderRejectionSnapshot = {
  key: string;
  reason: string;
  observedAt: number;
};

type SignalRejectionSnapshot = {
  key: string;
  reason: string;
  observedAt: number;
};

type RobotPresentationOptions = {
  nextCycleSeconds?: number | null;
  entryWindowSeconds?: number | null;
  expirationSeconds?: number | null;
};

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
  options: RobotPresentationOptions = {},
): RobotPresentation {
  if (!robotState) {
    return createPresentation("loading", "Consultando robô...");
  }

  if (isDisconnected(robotState)) {
    return createPresentation(
      "stopped",
      "Conta BullEx desconectada",
      "Reconecte para o robô operar",
    );
  }

  if (!robotState.enabled || robotState.status === "STOPPED") {
    return createPresentation("stopped", "Robô parado");
  }

  const status = robotState.status;
  const trade = robotState.last_trade;
  const signal = robotState.pending_signal;
  const result = trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;

  if (status === "SIGNAL_REJECTED") {
    const reason = getSignalRejectionReason(robotState);
    const key = [
      robotState.rejected_at ?? "-",
      robotState.last_signal?.created_at ?? "-",
      reason,
    ].join("|");

    if (signalRejectionSnapshot?.key !== key) {
      signalRejectionSnapshot = {
        key,
        reason,
        observedAt: now,
      };
    }
  }

  if (signalRejectionSnapshot && now - signalRejectionSnapshot.observedAt < REJECTION_DISPLAY_MS) {
    return createPresentation(
      "rejected",
      "Nenhum sinal aprovado",
      `Motivo: ${formatFriendlyRobotText(signalRejectionSnapshot.reason)}`,
    );
  }

  if (status === "SIGNAL_REJECTED") {
    return createNextCyclePresentation(robotState, now, options);
  }

  signalRejectionSnapshot = null;

  const orderRejected = status === "ORDER_REJECTED" || trade?.result === "ORDER_REJECTED";
  if (orderRejected) {
    const reason = getOrderRejectionReason(robotState);
    const key = [
      robotState.rejected_at ?? "-",
      trade?.order_id ?? "-",
      trade?.sent_at ?? "-",
      reason,
    ].join("|");

    if (orderRejectionSnapshot?.key !== key) {
      orderRejectionSnapshot = {
        key,
        reason,
        observedAt: now,
      };
    }
  }

  if (orderRejectionSnapshot && now - orderRejectionSnapshot.observedAt < REJECTION_DISPLAY_MS) {
    return createPresentation(
      "rejected",
      "Entrada rejeitada",
      `Motivo: ${formatFriendlyRobotText(orderRejectionSnapshot.reason)}`,
    );
  }

  if (orderRejected) {
    return createNextCyclePresentation(robotState, now, options);
  }

  if (!orderRejected) {
    orderRejectionSnapshot = null;
  }

  if (status === "SENDING_ORDER") {
    return createPresentation("operation", "Entrada liberada", "Enviando ordem...");
  }

  if (status === "PENDING_RESULT") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.expirationSeconds ?? robotState.expiration_seconds),
    );

    return {
      ...createPresentation(
        "operation",
        remainingSeconds > 0 ? "Operação em andamento" : "Aguardando resultado...",
        null,
        remainingSeconds > 0 ? `Expira em ${formatDuration(remainingSeconds)}` : null,
      ),
      trade,
      direction: trade?.direction ?? null,
    };
  }

  const operationInProgress =
    !result && (robotState.operation_in_progress || trade?.result === "PENDING_RESULT");
  const resultWaiting = !result && robotState.result_waiting;

  if (resultWaiting) {
    return {
      ...createPresentation("operation", "Aguardando resultado..."),
      trade,
      signal: trade ? null : signal,
      direction: trade?.direction ?? signal?.direction ?? null,
    };
  }

  if (operationInProgress) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.expirationSeconds ?? robotState.expiration_seconds),
    );

    return {
      ...createPresentation(
        "operation",
        remainingSeconds > 0 ? "Operação em andamento" : "Aguardando resultado...",
        null,
        remainingSeconds > 0 ? `Expira em ${formatDuration(remainingSeconds)}` : null,
      ),
      trade,
      direction: trade?.direction ?? null,
    };
  }

  if (robotState.entry_window_open) {
    return {
      ...createPresentation("entry", "Entrada liberada", "Enviando ordem..."),
      signal,
      direction: signal?.direction ?? null,
    };
  }

  if (trade && result && isRecentResult(trade.finished_at, now)) {
    return {
      ...createPresentation("result", result),
      trade,
      direction: trade.direction,
      result,
    };
  }

  if (signal && status === "WAITING_ENTRY_WINDOW") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.entryWindowSeconds ?? robotState.seconds_until_entry_window),
    );

    return {
      ...createPresentation(
        "analyzing",
        "Sinal encontrado",
        null,
        remainingSeconds > 0 ? `Entrada em ${formatDuration(remainingSeconds)}` : null,
      ),
      signal,
      direction: signal.direction,
    };
  }

  if (status === "WAITING_ENTRY_WINDOW") {
    return createPresentation("analyzing", "Analisando mercado...", "Buscando melhor ativo...");
  }

  if (status === "ANALYZING") {
    return createPresentation("analyzing", "Analisando mercado...", "Buscando melhor ativo...");
  }

  if (status === "WAITING_NEXT_CYCLE") {
    return createNextCyclePresentation(robotState, now, options);
  }

  if (trade && result) {
    return createNextCyclePresentation(robotState, now, options);
  }

  if (status === "ERROR") {
    return createPresentation(
      "analyzing",
      "Erro no robô",
      formatFriendlyRobotText(robotState.rejection_reason ?? "Não foi possível concluir o ciclo."),
    );
  }

  return createNextCyclePresentation(robotState, now, options, "Robô ativo", 300);
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

export function formatSignalReasonLines(reason: string | null | undefined) {
  if (!reason) return [];
  return reason
    .split(/\r?\n|;|\|/)
    .map((line) => formatFriendlyRobotText(line))
    .filter(Boolean);
}

export function formatFriendlyRobotText(value: string | null | undefined) {
  if (!value) return "Motivo não informado.";

  const replacements: Record<string, string> = {
    TREND_CLEAR: "Tendência clara",
    SIDEWAYS: "Mercado lateral",
    WAITING_NEXT_CYCLE: "Aguardando próxima análise",
    SIGNAL_REJECTED: "Nenhum sinal aprovado",
  };

  return value
    .replace(
      /\b(TREND_CLEAR|SIDEWAYS|WAITING_NEXT_CYCLE|SIGNAL_REJECTED)\b/gi,
      (code) => replacements[code.toUpperCase()],
    )
    .replace(/_/g, " ")
    .trim();
}

export function resetRobotPresentationState() {
  orderRejectionSnapshot = null;
  signalRejectionSnapshot = null;
}

function isDisconnected(robotState: RobotState) {
  return (
    robotState.connected === false ||
    robotState.disconnected ||
    robotState.status === "ACCOUNT_DISCONNECTED"
  );
}

function getOrderRejectionReason(robotState: RobotState) {
  return (
    robotState.last_order_error ?? robotState.rejection_reason ?? "Ordem recusada pela corretora."
  );
}

function getSignalRejectionReason(robotState: RobotState) {
  return (
    robotState.last_rejection_reason ??
    robotState.rejection_reason ??
    "Nenhum sinal atingiu os critérios da estratégia."
  );
}

function createNextCyclePresentation(
  robotState: RobotState,
  now: number,
  options: RobotPresentationOptions = {},
  title = "Analisando...",
  fallbackSeconds = robotState.cycle_minutes * 60,
) {
  const remainingSeconds =
    options.nextCycleSeconds ??
    (robotState.seconds_until_next_cycle > 0
      ? robotState.seconds_until_next_cycle
      : fallbackSeconds);

  if (remainingSeconds <= 0) {
    return createPresentation("analyzing", "Analisando mercado...");
  }

  return createPresentation(
    "analyzing",
    title,
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
