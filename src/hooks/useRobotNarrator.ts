import { useEffect, useRef, useState } from "react";
import type { RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";
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
      spokenKeysRef.current.clear();
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
  const operationOpen =
    robotState.operation_in_progress ||
    robotState.result_waiting ||
    status === "SENDING_ORDER" ||
    status === "PENDING_RESULT" ||
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
          ? `Stop win atingido. Meta de ganho alcançada. Lucro atual de ${formatProfit(robotState.profit)}. Robô pausado.`
          : `Stop loss atingido. Limite de perda alcançado. Prejuízo atual de ${formatProfit(robotState.profit)}. Robô pausado.`,
    });
    return events;
  }

  if (signal && status === "WAITING_ENTRY_WINDOW") {
    events.push({
      key: createSignalEventKey(signal),
      text: `Sinal encontrado em ${formatSpokenActive(signal.symbol)}. Direção ${
        signal.direction
      }. Estratégia usada. ${formatSpokenStrategy(
        signal.strategy_name ?? "não informada",
      )}. Motivo. ${formatNarrationReason(
        signal.strategy_reason ?? signal.reason ?? "não informado",
      )}. Confiança ${formatPercent(signal.confidence)} por cento. Payout ${formatPercent(
        signal.payout,
      )} por cento.`,
    });
  }

  if (status === "ANALYZING" && !operationOpen) {
    events.push({
      key: `ANALYSIS_STARTED|${analysisSequence}`,
      text: "Iniciando nova análise de mercado.",
    });
  }

  if (status === "SENDING_ORDER") {
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal),
      text: "Entrada liberada. Enviando ordem agora.",
    });
  }

  if (!result && (status === "PENDING_RESULT" || robotState.operation_in_progress)) {
    const active = trade?.active;
    if (active) {
      events.push({
        key: createEventKey("PENDING_RESULT", orderId, signalCreatedAt, signal),
        text: `Operação aberta em ${formatSpokenActive(active)}. Aguardando resultado.`,
      });
    }
  }

  if (status === "SIGNAL_REJECTED") {
    const reason =
      robotState.last_rejection_reason ?? robotState.rejection_reason ?? "Sinal insuficiente";
    events.push({
      key: createEventKey("SIGNAL_REJECTED", orderId, signalCreatedAt, signal, reason),
      text: "Nenhum sinal aprovado nesta análise. Próxima análise em cinco minutos.",
    });
  }

  if (status === "ORDER_REJECTED" || trade?.result === "ORDER_REJECTED") {
    const reason =
      robotState.last_order_error ?? robotState.rejection_reason ?? "Ordem recusada pela corretora";
    events.push({
      key: createEventKey("ORDER_REJECTED", orderId, signalCreatedAt, signal, reason),
      text: `Entrada rejeitada. Motivo: ${formatNarrationReason(reason)}.`,
    });
  }

  if (result === "WIN") {
    events.push({
      key: createResultKey("WIN", trade),
      text: `Green confirmado. Operação vencedora. Lucro de ${formatProfit(trade?.profit)}.`,
    });
  }

  if (result === "LOSS") {
    events.push({
      key: createResultKey("LOSS", trade),
      text: `Loss confirmado. Operação perdida. Prejuízo de ${formatProfit(trade?.profit)}.`,
    });
  }

  if (status === "WAITING_NEXT_CYCLE") {
    const remainingSeconds = nextCycleSeconds ?? getRemainingNextCycleSeconds(robotState);
    if (remainingSeconds > 0) {
      events.push({
        key: createEventKey(status, orderId, signalCreatedAt, signal, robotState.next_cycle_at),
        text: `Robô vai analisar o mercado. A próxima entrada está prevista para daqui a ${formatSpokenDuration(
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

function createSignalEventKey(signal: RobotSignal) {
  return ["SIGNAL_FOUND", signal.symbol, signal.direction, signal.created_at ?? "-"].join("|");
}

function createResultKey(result: "WIN" | "LOSS", trade: RobotTrade | null) {
  return [
    result,
    trade?.order_id ?? "-",
    trade?.sent_at ?? "-",
    trade?.finished_at ?? "-",
    trade?.profit ?? "-",
  ].join("|");
}

function getTradeResult(trade: RobotTrade | null) {
  return trade?.result === "WIN" || trade?.result === "LOSS" ? trade.result : null;
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

function formatTechnicalSpeech(value: string) {
  return value
    .replace(/([a-zà-öø-ÿ])([A-Z])/g, "$1 $2")
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

function getRemainingNextCycleSeconds(robotState: RobotState) {
  return Math.max(0, Math.ceil(robotState.seconds_until_next_cycle));
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

function formatPercent(value: number | null) {
  return Math.round(value ?? 0);
}

function formatProfit(value: number | null | undefined) {
  const amount = Math.abs(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const CURRENCY_NAMES: Record<string, string> = {
  AED: "dirrã",
  ARS: "peso argentino",
  AUD: "dólar australiano",
  BCH: "bitcoin cash",
  BNB: "binance coin",
  BRL: "real",
  BTC: "bitcoin",
  CAD: "dólar canadense",
  CHF: "franco suíço",
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
  NZD: "dólar neozelandês",
  PEN: "sol peruano",
  SOL: "solana",
  TRY: "lira turca",
  USD: "dólar",
  USDT: "tether",
  XRP: "ripple",
  ZAR: "rand sul-africano",
};
