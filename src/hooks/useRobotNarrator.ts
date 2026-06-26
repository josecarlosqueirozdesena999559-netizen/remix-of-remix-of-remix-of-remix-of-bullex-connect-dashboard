import { useEffect, useRef, useState } from "react";
import type { RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";
import { getRobotAiReview } from "@/lib/robotAi";
import { formatFriendlyRobotText } from "@/lib/robotPresentation";

type NarrationEvent = {
  key: string;
  text: string;
};

export function useRobotNarrator(
  robotState: RobotState | undefined,
  enabled: boolean,
  nextCycleSeconds: number | null = null,
) {
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState(false);
  const [speechCycle, setSpeechCycle] = useState(0);
  const previousStatusRef = useRef<string | null>(null);
  const analysisSequenceRef = useRef(0);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    if (enabled) {
      setSpeechCycle((cycle) => cycle + 1);
    }
  }, [enabled, supported]);

  useEffect(() => {
    if (!supported || !enabled || !robotState) return;
    if (previousStatusRef.current !== robotState.status) {
      if (robotState.status === "ANALYZING") {
        analysisSequenceRef.current += 1;
      }
      previousStatusRef.current = robotState.status;
    }

    const stopLimit = getStopLimit(robotState);
    if ((!robotState.enabled || robotState.status === "STOPPED") && !stopLimit) return;
    if (document.visibilityState !== "visible") return;
    if (speaking || window.speechSynthesis.speaking || window.speechSynthesis.pending) return;

    const event = getNarrationEvents(
      robotState,
      nextCycleSeconds,
      analysisSequenceRef.current,
    ).find((nextEvent) => !spokenKeysRef.current.has(nextEvent.key));
    if (!event || spokenKeysRef.current.has(event.key)) return;

    if (robotState.status === "WAITING_NEXT_CANDLE_ENTRY") {
      console.log("[NEXT_CANDLE_NARRATION_SENT]", {
        eventKey: event.key,
        cycleId: robotState.cycle_id ?? null,
        symbol: robotState.pending_signal?.symbol ?? null,
        direction: robotState.pending_signal?.direction ?? null,
      });
    }

    const utterance = new SpeechSynthesisUtterance(event.text);
    utterance.lang = "pt-BR";
    utterance.voice = getPortugueseVoice();
    utterance.rate = 0.78;
    utterance.pitch = 1;
    utterance.onstart = () => {
      spokenKeysRef.current.add(event.key);
      setSpeaking(true);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setSpeechCycle((cycle) => cycle + 1);
    };
    utterance.onerror = (speechError) => {
      if (speechError.error !== "canceled" && speechError.error !== "interrupted") {
        spokenKeysRef.current.add(event.key);
      }
      setSpeaking(false);
      setSpeechCycle((cycle) => cycle + 1);
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [enabled, nextCycleSeconds, robotState, speaking, speechCycle, supported]);

  function silence() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return { speaking, supported, silence };
}

function getNarrationEvents(
  robotState: RobotState,
  nextCycleSeconds: number | null,
  analysisSequence: number,
): NarrationEvent[] {
  const events: NarrationEvent[] = [];
  const status = robotState.status;
  const signal = robotState.pending_signal;
  const trade = robotState.last_trade;
  const orderId = trade?.order_id ?? "-";
  const signalCreatedAt = signal?.created_at ?? "-";
  const result = getTradeResult(trade);
  const stopLimit = getStopLimit(robotState);
  const aiReview = getRobotAiReview(signal);
  const operationOpen =
    robotState.operation_in_progress ||
    robotState.result_waiting ||
    status === "SENDING_ORDER" ||
    status === "PENDING_RESULT" ||
    status === "WAITING_GALE_ENTRY" ||
    status === "SENDING_GALE_ORDER" ||
    status === "PENDING_GALE_RESULT" ||
    trade?.result === "PENDING_RESULT";

  if (stopLimit) {
    events.push({
      key: createEventKey(
        stopLimit,
        orderId,
        signalCreatedAt,
        signal,
        `${robotState.profit}:${robotState.wins}:${robotState.losses}:${robotState.stop_reason ?? ""}`,
      ),
      text:
        stopLimit === "STOP_WIN"
          ? `Meta de lucro atingida. Resultado atual de ${formatProfit(robotState.profit)}. Respeite o seu gerenciamento e siga com disciplina. Vamos em frente com o robo do Sergio Trader.`
          : `Limite de perda atingido. Resultado atual de ${formatProfit(robotState.profit)}. Respeite o seu gerenciamento para proteger o capital. O robo foi pausado com seguranca.`,
    });
    return events;
  }

  if (signal && status === "WAITING_ENTRY_WINDOW") {
    events.push({
      key: createSignalEventKey(signal),
      text: `O ElCapo encontrou uma oportunidade em ${formatSpokenActive(signal.symbol)}. Direcao ${
        signal.direction
      }. Score ${formatScore(signal.strategy_score)}. Estrategia utilizada: ${formatUsedStrategies(
        signal,
      )}. Aguardando janela de entrada.`,
    });
  }

  if (signal && status === "WAITING_NEXT_CANDLE_ENTRY") {
    if (aiReview?.voiceText) {
      events.push({
        key: createAiVoiceEventKey(robotState, signal, aiReview.voiceText),
        text: aiReview.voiceText,
      });
    } else {
      events.push({
        key: createStatusSignalCycleEventKey(status, signal, robotState.cycle_id),
        text: `Entrada preparada. Estrategia confirmada: ${formatUsedStrategies(signal)}. Vamos entrar no inicio da proxima vela.`,
      });
    }
  }

  if (status === "ANALYZING" && !operationOpen) {
    events.push({
      key: `ANALYSIS_STARTED|${analysisSequence}`,
      text: "O ElCapo vai analisar o mercado em busca da melhor oportunidade.",
    });
  }

  if (status === "SENDING_ORDER") {
    events.push({
      key: createStatusSignalCycleEventKey(
        status,
        signal,
        robotState.cycle_id,
        `${trade?.order_id ?? "-"}|${signalCreatedAt}`,
      ),
      text: "Entrada liberada. Enviando ordem agora.",
    });
  }

  if (status === "WAITING_GALE_ENTRY") {
    events.push({
      key: createGaleEventKey(robotState, orderId),
      text: "Loss confirmado na entrada inicial. Gale 1 preparado no mesmo ativo e na mesma direcao.",
    });
  }

  if (status === "SENDING_GALE_ORDER") {
    events.push({
      key: createGaleEventKey(robotState, orderId),
      text: "Executando Gale 1 agora.",
    });
  }

  if (status === "PENDING_GALE_RESULT") {
    events.push({
      key: createGaleEventKey(robotState, orderId),
      text: "Aguardando resultado do Gale 1.",
    });
  }

  if (!result && (status === "PENDING_RESULT" || robotState.operation_in_progress)) {
    const active = trade?.active;
    if (active) {
      events.push({
        key: createEventKey("PENDING_RESULT", orderId, signalCreatedAt, signal),
        text: `Operacao aberta em ${formatSpokenActive(active)}. Aguardando resultado.`,
      });
    }
  }

  if (status === "ORDER_REJECTED" || trade?.result === "ORDER_REJECTED") {
    const reason =
      robotState.last_order_error ?? robotState.rejection_reason ?? "Ordem recusada pela corretora";
    events.push({
      key: createEventKey("ORDER_REJECTED", orderId, signalCreatedAt, signal, reason),
      text: `Entrada rejeitada. Motivo: ${formatNarrationReason(reason)}.`,
    });
  }

  if (status === "RESULT_RECEIVED" && result === "WIN") {
    events.push({
      key: createResultKey("WIN", trade),
      text: "Operacao encerrada com WIN. Resultado positivo confirmado.",
    });
  }

  if (status === "RESULT_RECEIVED" && result === "LOSS") {
    events.push({
      key: createResultKey("LOSS", trade),
      text: "Operacao encerrada com LOSS. Seguimos o plano com disciplina.",
    });
  }

  if (
    isGaleResultReceived(status, robotState.cycle_result) &&
    robotState.cycle_result === "GALE_WIN"
  ) {
    events.push({
      key: createGaleEventKey(robotState, orderId),
      text: "Gale 1 encerrado com WIN. Recuperacao concluida com sucesso.",
    });
  }

  if (
    isGaleResultReceived(status, robotState.cycle_result) &&
    robotState.cycle_result === "GALE_LOSS"
  ) {
    events.push({
      key: createGaleEventKey(robotState, orderId),
      text: "Gale 1 encerrado com LOSS. Ciclo finalizado. Mantenha o gerenciamento com disciplina.",
    });
  }

  if (status === "WAITING_NEXT_CYCLE") {
    const remainingSeconds = nextCycleSeconds ?? 0;
    if (remainingSeconds > 0) {
      events.push({
        key: createEventKey(status, orderId, signalCreatedAt, signal, robotState.next_cycle_at),
        text: `O ElCapo vai analisar o mercado novamente. A proxima oportunidade esta prevista para daqui a ${formatSpokenDuration(
          remainingSeconds,
        )}.`,
      });
    }
  }

  return events;
}

function createEventKey(
  status: string,
  orderId: string,
  signalCreatedAt: string,
  signal: RobotSignal | null,
  extra = "",
) {
  return [
    status,
    orderId,
    signalCreatedAt,
    signal?.symbol ?? "-",
    signal?.direction ?? "-",
    extra,
  ].join("|");
}

function createStatusSignalCycleEventKey(
  status: string,
  signal: RobotSignal | null,
  cycleId: string | null,
  extra = "",
) {
  return [status, signal?.symbol ?? "-", signal?.direction ?? "-", cycleId ?? "-", extra].join(
    "|",
  );
}

function createSignalEventKey(signal: RobotSignal) {
  return ["SIGNAL_FOUND", signal.symbol, signal.direction, signal.created_at ?? "-"].join("|");
}

function createAiVoiceEventKey(robotState: RobotState, signal: RobotSignal, aiVoiceText: string) {
  return `${robotState.cycle_id ?? "-"}${signal.symbol}${aiVoiceText}`;
}

function createResultKey(result: "WIN" | "LOSS", trade: RobotTrade | null) {
  return `${trade?.order_id ?? "-"}|${result}`;
}

function createGaleEventKey(robotState: RobotState, orderId: string) {
  return [
    robotState.cycle_id ?? "-",
    robotState.status,
    robotState.gale_step ?? robotState.last_trade?.gale_step ?? "-",
    orderId,
  ].join("|");
}

function getTradeResult(trade: RobotTrade | null) {
  return trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;
}

function isGaleResultReceived(status: string, cycleResult: string | null) {
  return (
    (status === "RESULT_RECEIVED" || status === "GALE_RESULT_RECEIVED") &&
    (cycleResult === "GALE_WIN" || cycleResult === "GALE_LOSS")
  );
}

function getStopLimit(robotState: RobotState): "STOP_WIN" | "STOP_LOSS" | null {
  const text = `${robotState.status} ${robotState.stop_reason ?? ""}`
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (text.includes("STOP_WIN") || text.includes("WIN_REACHED") || text.includes("TAKE_PROFIT")) {
    return "STOP_WIN";
  }

  if (text.includes("STOP_LOSS") || text.includes("LOSS_REACHED") || text.includes("MAX_LOSS")) {
    return "STOP_LOSS";
  }

  return null;
}

function getPortugueseVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "pt-br") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("pt")) ??
    null
  );
}

function formatSpokenActive(active: string) {
  const raw = active.trim();
  const clean = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[_-]OTC$/, "")
    .replace(/[^A-Z0-9/]/g, "");
  const isOtc = /(^|[_\-/\s])OTC$/i.test(raw);
  const parts = clean.includes("/") ? clean.split("/").filter(Boolean) : splitCurrencyPair(clean);
  const spoken = parts.map((part) => CURRENCY_NAMES[part] ?? spellCode(part)).join(" ");

  return isOtc ? `${spoken}, OTC` : spoken || raw;
}

function splitCurrencyPair(active: string) {
  const knownCodes = Object.keys(CURRENCY_NAMES).sort((a, b) => b.length - a.length);
  for (const base of knownCodes) {
    if (!active.startsWith(base)) continue;
    const quote = active.slice(base.length);
    if (quote && CURRENCY_NAMES[quote]) return [base, quote];
  }

  if (active.length === 6) return [active.slice(0, 3), active.slice(3)];
  return [active];
}

function spellCode(code: string) {
  return code.split("").join(" ");
}

function formatSpokenReason(reason: string | null | undefined) {
  if (!reason) return "sem motivo informado";
  return reason
    .replace(/\bCALL\b/gi, "compra")
    .replace(/\bPUT\b/gi, "venda")
    .replace(/_/g, " ")
    .trim();
}

function formatNarrationReason(reason: string) {
  return formatTechnicalSpeech(formatSpokenReason(formatFriendlyRobotText(reason))).replace(
    /[.!?]+$/,
    "",
  );
}

function formatSpokenStrategy(strategy: string) {
  return formatTechnicalSpeech(formatFriendlyRobotText(strategy)).replace(/[.!?]+$/, "");
}

function formatUsedStrategies(signal: RobotSignal) {
  const strategies =
    signal.used_strategies.length > 0
      ? signal.used_strategies
      : [signal.strategy_name ?? "nao informada"];

  return strategies.map(formatSpokenStrategy).join(", ");
}

function formatScore(value: number | null) {
  if (value == null) return "nao informado";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function formatTechnicalSpeech(value: string) {
  return removeSpeechDiacritics(value)
    .replace(/([a-zA-Z])([A-Z])/g, "$1 $2")
    .replace(/[_/\\-]+/g, " ")
    .replace(/\bRSI\b/gi, "R S I")
    .replace(/\bMACD\b/gi, "M A C D")
    .replace(/\bEMA\b/gi, "E M A")
    .replace(/\bSMA\b/gi, "S M A")
    .replace(/\bADX\b/gi, "A D X")
    .replace(/\bOTC\b/gi, "O T C")
    .replace(/\s+/g, " ")
    .trim();
}

function removeSpeechDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatSpokenDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;

  if (minutesPart <= 0) return `${secondsPart} ${secondsPart === 1 ? "segundo" : "segundos"}`;
  if (secondsPart <= 0) return `${minutesPart} ${minutesPart === 1 ? "minuto" : "minutos"}`;

  return `${minutesPart} ${minutesPart === 1 ? "minuto" : "minutos"} e ${secondsPart} ${
    secondsPart === 1 ? "segundo" : "segundos"
  }`;
}

function formatProfit(value: number | null | undefined) {
  const amount = Math.abs(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const CURRENCY_NAMES: Record<string, string> = {
  AED: "dirra",
  ARS: "peso argentino",
  AUD: "dolar australiano",
  BCH: "bitcoin cash",
  BNB: "binance coin",
  BRL: "real",
  BTC: "bitcoin",
  CAD: "dolar canadense",
  CHF: "franco suico",
  CLP: "peso chileno",
  CNY: "yuan",
  COP: "peso colombiano",
  DOGE: "dogecoin",
  ETH: "ethereum",
  EUR: "euro",
  GBP: "libra",
  JPY: "iene",
  LTC: "litecoin",
  MXN: "peso mexicano",
  NZD: "dolar neozelandes",
  PEN: "sol peruano",
  SOL: "solana",
  TRY: "lira turca",
  USD: "dolar",
  USDT: "tether",
  XRP: "ripple",
  ZAR: "rand sul-africano",
};
