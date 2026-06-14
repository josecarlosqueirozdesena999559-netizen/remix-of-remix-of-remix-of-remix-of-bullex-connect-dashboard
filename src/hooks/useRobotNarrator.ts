import { useEffect, useRef, useState } from "react";
import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";
import { formatDuration } from "@/lib/robotPresentation";

type NarrationEvent = {
  key: string;
  text: string;
};

export function useRobotNarrator(robotState: RobotState | undefined, enabled: boolean) {
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported || enabled) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [enabled, supported]);

  useEffect(() => {
    if (!supported || !enabled || !robotState?.enabled || robotState.status === "STOPPED") return;
    if (document.visibilityState !== "visible") return;

    const event = getNarrationEvents(robotState).find(
      (nextEvent) => !spokenKeysRef.current.has(nextEvent.key),
    );
    if (!event || spokenKeysRef.current.has(event.key)) return;

    spokenKeysRef.current.add(event.key);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(event.text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    try {
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [enabled, robotState, supported]);

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

  if (status === "WAITING_ENTRY_WINDOW" && signal) {
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal),
      text: `Sinal encontrado em ${signal.symbol}. Direcao ${translateDirection(
        signal.direction,
      )}. Confianca ${formatPercent(signal.confidence)} por cento. Motivo: ${
        signal.reason ?? "sem motivo informado"
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
        text: `Operacao aberta em ${active}. Aguardando resultado.`,
      });
    }
  }

  if (result === "WIN") {
    events.push({
      key: createResultKey("WIN", trade),
      text: `Green confirmado. Operacao vencedora. Lucro de ${formatProfit(trade?.profit)}.`,
    });
  }

  if (result === "LOSS") {
    events.push({
      key: createResultKey("LOSS", trade),
      text: `Loss confirmado. Operacao perdida. Prejuizo de ${formatProfit(trade?.profit)}.`,
    });
  }

  if (status === "WAITING_NEXT_CYCLE") {
    events.push({
      key: createEventKey(status, orderId, signalCreatedAt, signal, robotState.next_cycle_at),
      text: `Robo analisando. Proxima entrada em ${formatDuration(
        robotState.seconds_until_next_cycle,
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
