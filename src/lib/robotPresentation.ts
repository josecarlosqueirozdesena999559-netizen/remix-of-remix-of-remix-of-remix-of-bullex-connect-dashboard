import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type RobotResult = "WIN" | "LOSS" | null;
const REJECTION_DISPLAY_MS = 5000;
let orderRejectionSnapshot: OrderRejectionSnapshot | null = null;

type OrderRejectionSnapshot = {
  key: string;
  reason: string;
  observedAt: number;
};

export type RobotGale = {
  active: string;
  direction: RobotDirection;
  amount: number | null;
  step: number;
};

type RobotPresentationOptions = {
  analysisWindowSeconds?: number | null;
  nextCycleSeconds?: number | null;
  entryWindowSeconds?: number | null;
  expirationSeconds?: number | null;
};

export type RobotPresentation = {
  kind:
    | "loading"
    | "stopped"
    | "analyzing"
    | "entry"
    | "operation"
    | "rejected"
    | "result"
    | "gale";
  title: string;
  detail: string | null;
  footer: string | null;
  signal: RobotSignal | null;
  trade: RobotTrade | null;
  gale: RobotGale | null;
  direction: RobotDirection | null;
  result: RobotResult;
};

export function getRobotPresentation(
  robotState: RobotState | undefined,
  now: number,
  options: RobotPresentationOptions = {},
): RobotPresentation {
  if (!robotState) {
    return createPresentation("loading", "Consultando robo...");
  }

  if (isDisconnected(robotState)) {
    return createPresentation(
      "stopped",
      "Conta BullEx desconectada",
      "Reconecte para o robo operar",
    );
  }

  const status = robotState.status;
  if (status === "INSUFFICIENT_BALANCE") {
    return createPresentation(
      "stopped",
      "Saldo insuficiente",
      "Você está sem saldo para iniciar. Faça um depósito na BullEx.",
    );
  }

  const trade = robotState.last_trade;
  const signal = robotState.pending_signal;
  const bestCandidate = robotState.best_candidate;
  const result = getCycleResult(robotState) ?? getTradeResult(trade);
  const activeSignal = signal ?? bestCandidate;
  const officialCountdown = getOfficialCountdown(robotState);

  const operationOpen =
    robotState.operation_in_progress ||
    robotState.result_waiting ||
    status === "ORDER_OPEN" ||
    status === "WAITING_RESULT" ||
    status === "PENDING_RESULT" ||
    trade?.result === "PENDING_RESULT";

  if (robotState.last_order_error && status === "BUY_ERROR") {
    return createPresentation(
      "rejected",
      "Compra REAL bloqueada",
      formatFriendlyRobotText(robotState.last_order_error),
      officialCountdown ? `Próxima entrada em ${officialCountdown}` : null,
    );
  }

  if (status === "BUYING" || status === "SENDING_ORDER") {
    return {
      ...createPresentation(
        "operation",
        "Executando ordem",
        robotState.operation_message ?? "Enviando ordem...",
      ),
      trade,
      signal: trade ? null : activeSignal,
      direction: trade?.direction ?? activeSignal?.direction ?? null,
    };
  }

  if (operationOpen) {
    return {
      ...createPresentation(
        "operation",
        "Operação aberta",
        "Aguardando resultado",
        officialCountdown ? `Resultado em ${officialCountdown}` : null,
      ),
      trade,
      signal: trade ? null : activeSignal,
      direction: trade?.direction ?? activeSignal?.direction ?? null,
    };
  }

  if (result && shouldShowResult(robotState, now)) {
    return {
      ...createPresentation("result", formatResultTitle(result)),
      trade,
      signal: trade ? null : activeSignal,
      direction: trade?.direction ?? activeSignal?.direction ?? null,
      result,
    };
  }

  if (status === "STOPPED" || isRobotFullyStopped(robotState)) {
    return createPresentation("stopped", "Robo parado");
  }

  if (status === "STOP_WIN_HIT") {
    return createPresentation("stopped", "Stop Win atingido", "Robo pausado");
  }

  if (status === "STOP_LOSS_HIT") {
    return createPresentation("stopped", "Stop Loss atingido", "Robo pausado");
  }

  if (status === "SIGNAL_REJECTED") {
    return createNextCyclePresentation(robotState, options);
  }

  if (status === "WAITING_NEXT_CYCLE") {
    return createWaitingNextCyclePresentation(robotState, options);
  }

  if (
    status !== "ORDER_REJECTED" &&
    trade?.result !== "ORDER_REJECTED" &&
    isOrderFallbackInProgress(robotState)
  ) {
    return createPresentation("analyzing", "Ativo indisponivel, tentando proximo melhor ativo...");
  }

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
    return createNextCyclePresentation(robotState, options);
  }

  if (!orderRejected) {
    orderRejectionSnapshot = null;
  }

  if (status === "WAITING_GALE_ENTRY" || robotState.gale_pending) {
    const gale = getGale(robotState);
    return {
      ...createPresentation("gale", "Gale preparado", null, "Entrada no início da próxima vela"),
      gale,
      direction: gale?.direction ?? null,
    };
  }

  if (status === "SENDING_GALE_ORDER" || robotState.gale_in_progress) {
    const gale = getGale(robotState);
    return {
      ...createPresentation("operation", "Gale em andamento"),
      gale,
      direction: gale?.direction ?? null,
    };
  }

  if (status === "PENDING_GALE_RESULT") {
    const gale = getGale(robotState);
    return {
      ...createPresentation("operation", "Aguardando resultado do Gale 1"),
      gale,
      direction: gale?.direction ?? null,
    };
  }

  if (status === "SIGNAL_FOUND") {
    return {
      ...createPresentation(
        "entry",
        "Melhor ativo encontrado",
        null,
        officialCountdown ? `Entrada em ${officialCountdown}` : null,
      ),
      signal: activeSignal,
      direction: activeSignal?.direction ?? null,
    };
  }

  if (status === "WAITING_ENTRY_WINDOW") {
    return {
      ...createPresentation(
        "entry",
        "Melhor ativo encontrado",
        null,
        officialCountdown ? `Entrada em ${officialCountdown}` : null,
      ),
      signal: activeSignal,
      direction: activeSignal?.direction ?? null,
    };
  }

  if (status === "WAITING_ENTRY" || status === "WAITING_NEXT_CANDLE_ENTRY") {
    return {
      ...createPresentation(
        "entry",
        "Melhor ativo encontrado",
        null,
        officialCountdown ? `Entrada em ${officialCountdown}` : "Aguardando abertura da vela...",
      ),
      signal: activeSignal,
      direction: activeSignal?.direction ?? null,
    };
  }

  if (status === "SIGNAL_EXPIRED") {
    return createPresentation("analyzing", "Entrada perdida por atraso. Aguardando novo sinal.");
  }

  if (activeSignal) {
    return {
      ...createPresentation(
        "entry",
        "Melhor ativo encontrado",
        null,
        officialCountdown ? `Entrada em ${officialCountdown}` : null,
      ),
      signal: activeSignal,
      direction: activeSignal.direction,
    };
  }

  if (status === "ANALYZING") {
    return {
      ...createPresentation("analyzing", "Analisando mercado..."),
    };
  }

  if (status === "WAITING_ANALYSIS_WINDOW") {
    return createPresentation("analyzing", "Analisando mercado...");
  }

  if (trade && result) {
    return createNextCyclePresentation(robotState, options);
  }

  if (status === "ERROR") {
    return createPresentation(
      "analyzing",
      "Erro no robo",
      formatFriendlyRobotText(robotState.rejection_reason ?? "Nao foi possivel concluir o ciclo."),
    );
  }

  return createNextCyclePresentation(robotState, options, "Robo ativo");
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

export function formatFriendlyRobotText(value: string | null | undefined) {
  if (!value) return "Motivo nao informado.";

  const replacements: Record<string, string> = {
    TREND_CLEAR: "Tendencia clara",
    SIDEWAYS: "Mercado lateral",
    WAITING_NEXT_CYCLE: "Aguardando proxima analise",
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
}

function isDisconnected(robotState: RobotState) {
  if (robotState.connection_status_source === "cached_grace") return false;

  return (
    robotState.connected === false ||
    robotState.disconnected ||
    robotState.status === "ACCOUNT_DISCONNECTED" ||
    robotState.status === "DISCONNECTED"
  );
}

function isRobotFullyStopped(robotState: RobotState) {
  return robotState.enabled === false && robotState.worker_running === false;
}

function getOrderRejectionReason(robotState: RobotState) {
  return (
    robotState.last_order_error ?? robotState.rejection_reason ?? "Ordem recusada pela corretora."
  );
}

function isOrderFallbackInProgress(robotState: RobotState) {
  if (robotState.order_fallback_in_progress) return true;
  if (
    robotState.order_fallback_attempt > 0 &&
    robotState.order_fallback_attempt <= robotState.order_fallback_max_attempts
  ) {
    return true;
  }

  const fallbackText = [
    robotState.status,
    robotState.last_order_error,
    robotState.rejection_reason,
    robotState.last_rejection_reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    fallbackText.includes("FALLBACK") ||
    fallbackText.includes("TRYING_NEXT_ACTIVE") ||
    fallbackText.includes("NEXT_BEST_ACTIVE") ||
    fallbackText.includes("ACTIVE_UNAVAILABLE") ||
    fallbackText.includes("ACTIVE UNAVAILABLE") ||
    fallbackText.includes("ATIVO_INDISPONIVEL") ||
    fallbackText.includes("ATIVO INDISPONIVEL")
  );
}

function createNextCyclePresentation(
  robotState: RobotState,
  options: RobotPresentationOptions = {},
  title = "Analisando...",
  fallbackSeconds = 0,
) {
  const officialCountdown = getOfficialCountdown(robotState);

  if (!officialCountdown) {
    return createPresentation("analyzing", title);
  }

  return createPresentation("analyzing", title, officialCountdown);
}

function createWaitingNextCyclePresentation(
  robotState: RobotState,
  options: RobotPresentationOptions = {},
) {
  const officialCountdown = getOfficialCountdown(robotState);

  return createPresentation(
    "analyzing",
    "Analisando mercado...",
    officialCountdown,
  );
}

function getOfficialCountdown(robotState: RobotState) {
  const seconds = robotState.display_countdown_seconds;
  const countdown = seconds != null && seconds > 0 ? formatDuration(seconds) : null;
  if (!robotState.display_countdown_label) return countdown;
  return countdown ? `${robotState.display_countdown_label} ${countdown}` : robotState.display_countdown_label;
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
    gale: null,
    direction: null,
    result: null,
  };
}

function getGale(robotState: RobotState): RobotGale | null {
  const active = robotState.gale_active ?? robotState.last_trade?.active;
  const direction = robotState.gale_direction ?? robotState.last_trade?.direction;
  if (!active || !direction) return null;

  return {
    active,
    direction,
    amount: robotState.gale_amount ?? robotState.last_trade?.amount ?? null,
    step: robotState.gale_step ?? robotState.last_trade?.gale_step ?? 1,
  };
}

function getCycleResult(robotState: RobotState): Exclude<RobotResult, null> | null {
  if (robotState.cycle_result === "WIN") return "WIN";
  if (robotState.cycle_result === "LOSS") return "LOSS";
  if (robotState.cycle_result === "GALE_WIN") return "WIN";
  if (robotState.cycle_result === "GALE_LOSS") return "LOSS";
  return null;
}

function getTradeResult(trade: RobotTrade | null): Exclude<RobotResult, null> | null {
  if (trade?.result === "WIN" || trade?.result === "LOSS") return trade.result;
  return null;
}

function shouldShowResult(robotState: RobotState, now: number) {
  if (robotState.status === "WIN" || robotState.status === "LOSS") {
    if (!robotState.result_display_until) return false;
    const displayUntil = Date.parse(robotState.result_display_until);
    return Number.isFinite(displayUntil) && now < displayUntil;
  }
  if (isResultStatus(robotState.status) && !robotState.result_display_until) return true;
  if (!robotState.result_display_until) return false;
  const displayUntil = Date.parse(robotState.result_display_until);
  return Number.isFinite(displayUntil) && now < displayUntil;
}

function isResultStatus(status: string) {
  return (
    status === "WIN" ||
    status === "LOSS" ||
    status === "RESULT_WIN" ||
    status === "RESULT_LOSS" ||
    status === "RESULT_RECEIVED" ||
    status === "GALE_RESULT_RECEIVED"
  );
}

function formatResultTitle(result: Exclude<RobotResult, null>) {
  return result;
}
