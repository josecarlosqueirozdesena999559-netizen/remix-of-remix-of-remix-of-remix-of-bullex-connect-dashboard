import { useEffect, useRef, useState } from "react";
import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

type NarrationEvent = {
  key: string;
  text: string;
};

export function useRobotNarrator(robotState: RobotState | undefined, enabled: boolean) {
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState(false);
  const [speechCycle, setSpeechCycle] = useState(0);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported || enabled) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [enabled, supported]);

  useEffect(() => {
    if (!supported || !enabled || !robotState?.enabled || robotState.status === "STOPPED") return;
    if (document.visibilityState !== "visible") return;
    if (speaking || window.speechSynthesis.speaking || window.speechSynthesis.pending) return;

    const event = getNarrationEvents(robotState).find(
      (nextEvent) => !spokenKeysRef.current.has(nextEvent.key),
    );
    if (!event || spokenKeysRef.current.has(event.key)) return;

    spokenKeysRef.current.add(event.key);

    const utterance = new SpeechSynthesisUtterance(event.text);
    utterance.lang = "pt-BR";
    utterance.voice = getPortugueseVoice();
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onend = () => {
      setSpeaking(false);
      setSpeechCycle((cycle) => cycle + 1);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setSpeechCycle((cycle) => cycle + 1);
    };

    try {
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [enabled, robotState, speaking, speechCycle, supported]);

  function silence() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return { speaking, supported, silence };
}

function getNarrationEvents(robotState: RobotState): NarrationEvent[] {
  const events: NarrationEvent[] = [];
  const status = robotState.status;
  const signal = robotState.pending_signal;
  const trade = robotState.last_trade;
  const orderId = trade?.order_id ?? "-";
  const signalCreatedAt = signal?.created_at ?? "-";
  const result = getTradeResult(trade);

  if (
    !signal &&
    !trade &&
    robotState.connected !== false &&
    status !== "STOPPED" &&
    status !== "ACCOUNT_DISCONNECTED" &&
    status !== "SIGNAL_REJECTED"
  ) {
    events.push({
      key: createEventKey("ROBOT_ANALYSIS_STARTED", "-", "-", null),
      text: "Robô conectado. Vou começar as análises do mercado agora.",
    });
  }

  if (status === "WAITING_ENTRY_WINDOW" && signal) {
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal),
      text: `Sinal encontrado em ${formatSpokenActive(signal.symbol)}. Direção ${translateDirection(
        signal.direction,
      )}. Confiança ${formatPercent(signal.confidence)} por cento. Motivo: ${
        formatSpokenReason(signal.reason)
      }. Aguardando janela de entrada.`,
    });
  }

  if (status === "SENDING_ORDER") {
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal),
      text: "Entrada liberada. Enviando ordem agora.",
    });
  }

  if (!result && (status === "PENDING_RESULT" || robotState.operation_in_progress)) {
    const active = trade?.active ?? signal?.symbol;
    if (active) {
      events.push({
        key: createEventKey("PENDING_RESULT", orderId, signalCreatedAt, signal),
        text: `Operação aberta em ${formatSpokenActive(active)}. Aguardando resultado.`,
      });
    }
  }

  if (status === "SIGNAL_REJECTED") {
    events.push({
      key: createEventKey(
        "SIGNAL_REJECTED",
        orderId,
        signalCreatedAt,
        signal,
        robotState.last_rejection_reason ?? robotState.rejection_reason ?? "",
      ),
      text:
        "A entrada foi encontrada, porém não segue os parâmetros de análises confiáveis. Aguarde mais um pouco.",
    });
  }

  if (status === "ORDER_REJECTED" || trade?.result === "ORDER_REJECTED") {
    events.push({
      key: createEventKey("ORDER_REJECTED", orderId, signalCreatedAt, signal, robotState.rejection_reason ?? ""),
      text:
        "A entrada foi encontrada, porém não segue os parâmetros de análises confiáveis. Aguarde mais um pouco.",
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
    const remainingSeconds = getRemainingNextCycleSeconds(robotState);
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal, robotState.next_cycle_at),
      text: `Robô vai analisar o mercado. A próxima entrada está prevista para daqui a ${formatSpokenDuration(
        remainingSeconds,
      )}.`,
    });
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

function translateDirection(direction: RobotDirection) {
  if (direction === "CALL") return "compra";
  if (direction === "PUT") return "venda";
  return "aguardar";
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
  const parts = clean.includes("/")
    ? clean.split("/").filter(Boolean)
    : splitCurrencyPair(clean);
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
