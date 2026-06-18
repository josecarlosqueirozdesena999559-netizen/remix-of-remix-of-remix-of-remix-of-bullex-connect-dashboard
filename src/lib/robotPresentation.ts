import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type RobotResult = "WIN" | "LOSS" | null;
const RESULT_DISPLAY_MS = 5000;
const REJECTION_DISPLAY_MS = 5000;
let orderRejectionSnapshot: OrderRejectionSnapshot | null = null;
let resultSnapshot: ResultSnapshot | null = null;

type OrderRejectionSnapshot = {
  key: string;
  reason: string;
  observedAt: number;
};

type ResultSnapshot = {
  key: string;
  result: Exclude<RobotResult, null>;
  trade: RobotTrade | null;
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
  const trade = robotState.last_trade;
  const signal = robotState.pending_signal;
  const bestCandidate = robotState.best_candidate;
  const result = getCycleResult(robotState) ?? getTradeResult(trade);

  if (isResultStatus(status) && result) {
    const key = createResultEventKey(robotState, trade, result);
    if (resultSnapshot?.key !== key) {
      resultSnapshot = { key, result, trade, observedAt: now };
    }
  }

  if (resultSnapshot && now - resultSnapshot.observedAt < RESULT_DISPLAY_MS) {
    return {
      ...createPresentation("result", formatResultTitle(resultSnapshot.result)),
      trade: resultSnapshot.trade,
      direction: resultSnapshot.trade?.direction ?? null,
      result: resultSnapshot.result,
    };
  }

  if (!robotState.enabled || status === "STOPPED") {
    return createPresentation("stopped", "Robo parado");
  }

  if (status === "SIGNAL_REJECTED") {
    return createNextCyclePresentation(robotState, options);
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

  if (isOrderFallbackInProgress(robotState)) {
    return createPresentation("analyzing", "Ativo indisponivel, tentando proximo melhor ativo...");
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

  if (status === "SENDING_ORDER") {
    return createPresentation("operation", "Entrada liberada", "Enviando ordem...");
  }

  if (status === "PENDING_RESULT" && !result) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.expirationSeconds ?? robotState.expiration_seconds),
    );

    return {
      ...createPresentation(
        "operation",
        "Aguardando resultado",
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
      ...createPresentation("operation", "Aguardando resultado"),
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
        "Aguardando resultado",
        null,
        remainingSeconds > 0 ? `Expira em ${formatDuration(remainingSeconds)}` : null,
      ),
      trade,
      direction: trade?.direction ?? null,
    };
  }

  if (status === "WAITING_ENTRY_WINDOW") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.entryWindowSeconds ?? robotState.seconds_until_entry_window),
    );

    return {
      ...createPresentation(
        "analyzing",
        "Sinal encontrado",
        null,
        `Entrada em ${formatDuration(remainingSeconds)}`,
      ),
      signal,
      direction: signal?.direction ?? null,
    };
  }

  if (status === "WAITING_NEXT_CANDLE_ENTRY") {
    const remainingSeconds = Math.max(0, Math.ceil(resolveEntrySeconds(robotState, options)));

    return {
      ...createPresentation(
        "entry",
        "Sinal preparado",
        null,
        remainingSeconds > 0
          ? `Entrada no inicio da proxima vela em ${formatDuration(remainingSeconds)}`
          : "Aguardando abertura da vela...",
      ),
      signal,
      direction: signal?.direction ?? null,
    };
  }

  if (status === "ANALYZING") {
    return {
      ...createPresentation("analyzing", "Analisando mercado...", "Escolhendo melhor ativo..."),
      signal: bestCandidate,
      direction: bestCandidate?.direction ?? null,
    };
  }

  if (status === "WAITING_ANALYSIS_WINDOW") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil(options.analysisWindowSeconds ?? robotState.seconds_until_analysis_window),
    );

    return {
      ...createPresentation(
        "analyzing",
        "Analisando mercado...",
        bestCandidate ? `Melhor ativo: ${bestCandidate.symbol}` : "Escolhendo melhor ativo...",
        remainingSeconds > 0
          ? `Analise em ${formatDuration(remainingSeconds)}`
          : "Analise em 00:00",
      ),
      signal: bestCandidate,
      direction: bestCandidate?.direction ?? null,
    };
  }

  if (status === "WAITING_NEXT_CYCLE") {
    return createWaitingNextCyclePresentation(robotState, options);
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
  resultSnapshot = null;
}

function isDisconnected(robotState: RobotState) {
  if (robotState.connection_status_source === "cached_grace") return false;

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
  const remainingSeconds = resolveNextCycleSeconds(robotState, options, fallbackSeconds);

  if (remainingSeconds <= 0) {
    return createPresentation("analyzing", title);
  }

  return createPresentation("analyzing", title, `Proxima entrada em ${formatDuration(remainingSeconds)}`);
}

function createWaitingNextCyclePresentation(
  robotState: RobotState,
  options: RobotPresentationOptions = {},
) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil(
      options.nextCycleSeconds ??
        robotState.display_countdown_seconds ??
        robotState.seconds_until_next_cycle,
    ),
  );
  const bestCandidate = robotState.best_candidate;

  return {
    ...createPresentation(
      "analyzing",
      "Analisando mercado...",
      bestCandidate ? `Melhor ativo: ${bestCandidate.symbol}` : null,
      remainingSeconds > 0 ? `Entrada em ${formatDuration(remainingSeconds)}` : null,
    ),
    signal: bestCandidate,
    direction: bestCandidate?.direction ?? null,
  };
}

function resolveEntrySeconds(robotState: RobotState, options: RobotPresentationOptions) {
  return (
    options.entryWindowSeconds ??
    robotState.seconds_until_entry ??
    robotState.seconds_until_entry_window
  );
}

function resolveNextCycleSeconds(
  robotState: RobotState,
  options: RobotPresentationOptions,
  fallbackSeconds = 0,
) {
  if ("nextCycleSeconds" in options) {
    return options.nextCycleSeconds ?? fallbackSeconds;
  }

  return robotState.seconds_until_next_cycle > 0
    ? robotState.seconds_until_next_cycle
    : fallbackSeconds;
}

function createResultEventKey(
  robotState: RobotState,
  trade: RobotTrade | null,
  result: Exclude<RobotResult, null>,
) {
  return [
    robotState.cycle_id ?? "-",
    trade?.order_id ?? "-",
    robotState.gale_step ?? trade?.gale_step ?? "-",
    result,
  ].join("|");
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

function isResultStatus(status: string) {
  return status === "RESULT_RECEIVED" || status === "GALE_RESULT_RECEIVED";
}

function formatResultTitle(result: Exclude<RobotResult, null>) {
  return result;
}
