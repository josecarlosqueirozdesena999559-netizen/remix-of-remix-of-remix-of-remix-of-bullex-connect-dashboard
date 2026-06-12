import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Settings, X } from "lucide-react";
import type { RobotDirection, RobotState } from "@/hooks/useRobotState";

type RobotOverlayProps = {
  robotState: RobotState;
  onClose?: () => void;
  onConfig?: () => void;
  storageKey?: string;
};

type Position = {
  x: number;
  y: number;
};

type OverlayContent = {
  title: string;
  tone: string;
  details: ReactNode;
  footer: string | null;
};

const VIEWPORT_GAP = 12;

export function RobotOverlay({
  robotState,
  onClose,
  onConfig,
  storageKey = "robot-overlay-position",
}: RobotOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const now = useCurrentTime();
  const content = getOverlayContent(robotState, now);

  useEffect(() => {
    const savedPosition = readPosition(storageKey);
    const frame = window.requestAnimationFrame(() => {
      setPosition(clampPosition(savedPosition ?? getDefaultPosition(), overlayRef.current));
    });

    const handleResize = () => {
      setPosition((current) => clampPosition(current ?? getDefaultPosition(), overlayRef.current));
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [storageKey]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !position) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setPosition(
      clampPosition(
        {
          x: event.clientX - dragOffsetRef.current.x,
          y: event.clientY - dragOffsetRef.current.y,
        },
        overlayRef.current,
      ),
    );
  }

  function finishDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    setPosition((current) => {
      if (current) localStorage.setItem(storageKey, JSON.stringify(current));
      return current;
    });
  }

  return (
    <div
      ref={overlayRef}
      style={position ? { left: position.x, top: position.y } : { visibility: "hidden" }}
      className={`fixed z-50 flex max-w-[calc(100vw-24px)] touch-none select-none flex-col items-center ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
      aria-label="Robô flutuante. Arraste para reposicionar."
    >
      <div className="absolute -right-1 -top-7 flex items-center gap-1.5 sm:right-0">
        {onConfig ? (
          <button
            type="button"
            onClick={onConfig}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75"
            aria-label="Abrir configurações do robô"
          >
            <Settings className="h-3 w-3" />
            Config
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75"
            aria-label="Esconder overlay do robô"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-[72px_90px_72px] items-center gap-2 sm:grid-cols-[92px_140px_92px] sm:gap-4">
        <Score label="WIN" value={robotState.wins} tone="win" />
        <img
          src="/robo.png"
          alt="Robô analisando o mercado"
          className="pointer-events-none h-auto w-[90px] object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.8)] sm:w-[140px]"
          draggable={false}
        />
        <Score label="LOSS" value={robotState.losses} tone="loss" />
      </div>

      <div className="-mt-1 max-w-[92vw] text-center text-white [text-shadow:0_2px_5px_#000,0_0_10px_#000] sm:-mt-2">
        <p className={`text-sm font-bold sm:text-base ${content.tone}`}>{content.title}</p>
        {content.details ? (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-semibold sm:text-xs">
            {content.details}
          </div>
        ) : null}
        {content.footer ? (
          <p className="mt-0.5 text-[11px] font-semibold sm:text-xs">{content.footer}</p>
        ) : null}
      </div>
    </div>
  );
}

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function getOverlayContent(robotState: RobotState, now: number): OverlayContent {
  const trade = robotState.last_trade;
  const result = trade?.result.toUpperCase();

  if (!robotState.enabled || robotState.status === "STOPPED") {
    return {
      title: "Robô parado",
      tone: "",
      details: robotState.disconnected ? <span>Conta BullEx desconectada</span> : null,
      footer: null,
    };
  }

  if (trade && result === "WIN") {
    return {
      title: "\u2705 WIN",
      tone: "text-emerald-300",
      details: (
        <>
          <TradeIdentity active={trade.active} direction={trade.direction} />
          <span>Lucro: {formatMoney(Math.abs(trade.profit ?? 0))}</span>
        </>
      ),
      footer: null,
    };
  }

  if (trade && result === "LOSS") {
    return {
      title: "\u274c LOSS",
      tone: "text-red-300",
      details: (
        <>
          <TradeIdentity active={trade.active} direction={trade.direction} />
          <span>Prejuízo: {formatMoney(-Math.abs(trade.profit ?? trade.amount ?? 0))}</span>
        </>
      ),
      footer: null,
    };
  }

  if (trade && (robotState.operation_in_progress || result === "PENDING_RESULT")) {
    return {
      title: "Operando DEMO...",
      tone: "text-amber-200",
      details: (
        <>
          <TradeIdentity active={trade.active} direction={trade.direction} />
          {trade.amount != null ? <span>Entrada: {formatMoney(trade.amount)}</span> : null}
          {trade.confidence != null ? (
            <span>Confiança: {formatPercentage(trade.confidence)}%</span>
          ) : null}
          {trade.payout != null ? <span>Payout: {formatPercentage(trade.payout)}%</span> : null}
          <span>Resultado: Aguardando...</span>
        </>
      ),
      footer: `Expira em: ${formatDuration(getTradeRemainingSeconds(trade.sent_at, now))}`,
    };
  }

  if (robotState.status === "SIGNAL_SELECTED" && robotState.last_signal) {
    const signal = robotState.last_signal;
    return {
      title: "Sinal selecionado",
      tone: "text-sky-200",
      details: (
        <>
          <TradeIdentity active={signal.symbol} direction={signal.direction} />
          {signal.confidence != null ? (
            <span>Confiança: {formatPercentage(signal.confidence)}%</span>
          ) : null}
          {signal.payout != null ? <span>Payout: {formatPercentage(signal.payout)}%</span> : null}
        </>
      ),
      footer: null,
    };
  }

  if (robotState.status === "SIGNAL_REJECTED") {
    return {
      title: "Sinal rejeitado",
      tone: "text-amber-200",
      details: robotState.rejection_reason ? (
        <span>Motivo: {robotState.rejection_reason}</span>
      ) : null,
      footer: `Próxima análise em ${formatDuration(getCycleRemainingSeconds(robotState, now))}`,
    };
  }

  if (robotState.status === "WAITING_NEXT_CYCLE") {
    return {
      title: `Próxima análise em ${formatDuration(getCycleRemainingSeconds(robotState, now))}`,
      tone: "",
      details: null,
      footer: null,
    };
  }

  if (
    robotState.status === "ORDER_SENT" ||
    robotState.status === "OPERATION_SENT" ||
    robotState.status === "DEMO_ORDER_SENT"
  ) {
    return {
      title: "Operação enviada",
      tone: "text-amber-200",
      details: null,
      footer: null,
    };
  }

  if (robotState.status === "WAITING_RESULT" || robotState.status === "PENDING_RESULT") {
    return {
      title: "Aguardando resultado",
      tone: "text-amber-200",
      details: null,
      footer: null,
    };
  }

  return {
    title: "Analisando...",
    tone: "",
    details: null,
    footer: null,
  };
}

function TradeIdentity({ active, direction }: { active: string; direction: RobotDirection }) {
  return (
    <>
      <span>{active}</span>
      <span className={direction === "CALL" ? "text-emerald-300" : "text-red-300"}>
        {direction}
      </span>
    </>
  );
}

function getCycleRemainingSeconds(robotState: RobotState, now: number) {
  const nextCycleAt = parseDate(robotState.next_cycle_at);
  if (nextCycleAt != null) {
    return Math.max(0, Math.ceil((nextCycleAt - now) / 1000));
  }

  const elapsed = Math.floor((now - robotState.fetched_at) / 1000);
  return Math.max(0, Math.ceil(robotState.seconds_until_next_cycle - elapsed));
}

function getTradeRemainingSeconds(sentAt: string | null, now: number) {
  const sentAtTime = parseDate(sentAt);
  if (sentAtTime == null) return 0;
  return Math.max(0, Math.ceil(60 - (now - sentAtTime) / 1000));
}

function parseDate(value: string | null) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasTimezone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function Score({
  label,
  value,
  tone,
}: {
  label: "WIN" | "LOSS";
  value: number;
  tone: "win" | "loss";
}) {
  const color =
    tone === "win"
      ? "text-[#39ff88] [text-shadow:0_0_8px_#00ff66,0_2px_4px_#000]"
      : "text-[#ff4d5f] [text-shadow:0_0_8px_#ff1935,0_2px_4px_#000]";

  return (
    <div className={`text-center font-black ${color}`}>
      <div className="text-[10px] tracking-[0.22em] sm:text-xs">{label}</div>
      <div className="text-3xl leading-none sm:text-5xl">{value}</div>
    </div>
  );
}

function getDefaultPosition(): Position {
  const estimatedWidth = window.innerWidth < 640 ? 250 : 356;
  const estimatedHeight = window.innerWidth < 640 ? 155 : 210;
  const bounds = getViewportBounds();
  return {
    x: Math.max(bounds.minX, bounds.minX + (window.innerWidth - bounds.minX - estimatedWidth) / 2),
    y: Math.max(VIEWPORT_GAP, window.innerHeight - estimatedHeight - 32),
  };
}

function clampPosition(position: Position, element: HTMLDivElement | null): Position {
  const width = element?.offsetWidth ?? (window.innerWidth < 640 ? 250 : 356);
  const height = element?.offsetHeight ?? (window.innerWidth < 640 ? 155 : 210);
  const bounds = getViewportBounds();
  return {
    x: Math.min(
      Math.max(bounds.minX, position.x),
      Math.max(bounds.minX, window.innerWidth - width - VIEWPORT_GAP),
    ),
    y: Math.min(
      Math.max(bounds.minY, position.y),
      Math.max(bounds.minY, window.innerHeight - height - VIEWPORT_GAP),
    ),
  };
}

function getViewportBounds() {
  return window.innerWidth >= 768
    ? { minX: 256 + VIEWPORT_GAP, minY: VIEWPORT_GAP }
    : { minX: VIEWPORT_GAP, minY: 92 };
}

function readPosition(storageKey: string): Position | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    ) as Partial<Position> | null;
    if (typeof value?.x === "number" && typeof value?.y === "number") {
      return { x: value.x, y: value.y };
    }
  } catch {
    return null;
  }
  return null;
}

function formatPercentage(value: number) {
  return Math.round(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
