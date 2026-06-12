import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Settings, X } from "lucide-react";

export type RobotOverlaySignal = {
  symbol: string;
  signal: "CALL" | "PUT" | "WAIT";
  confidence: number;
  last_price?: number;
};

type RobotOverlayProps = {
  winCount: number;
  lossCount: number;
  status: string;
  signal?: RobotOverlaySignal;
  entryValue?: number;
  onClose?: () => void;
  onConfig?: () => void;
  storageKey?: string;
};

type Position = {
  x: number;
  y: number;
};

const VIEWPORT_GAP = 12;

export function RobotOverlay({
  winCount,
  lossCount,
  status,
  signal,
  entryValue,
  onClose,
  onConfig,
  storageKey = "robot-overlay-position",
}: RobotOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    console.log("[ROBOT OVERLAY STATUS]", status);
  }, [status]);

  useEffect(() => {
    if (signal) {
      console.log("[ROBOT OVERLAY SIGNAL]", signal);
    }
  }, [signal]);

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
      if (current) {
        localStorage.setItem(storageKey, JSON.stringify(current));
      }
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
        {onConfig && (
          <button
            type="button"
            onClick={onConfig}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75"
            aria-label="Abrir configurações do robô"
          >
            <Settings className="h-3 w-3" />
            Config
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/75"
            aria-label="Esconder overlay do robô"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-[72px_90px_72px] items-center gap-2 sm:grid-cols-[92px_140px_92px] sm:gap-4">
        <Score label="WIN" value={winCount} tone="win" />
        <img
          src="/robo.png"
          alt="Robô analisando o mercado"
          className="h-auto w-[90px] pointer-events-none object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.8)] sm:w-[140px]"
          draggable={false}
        />
        <Score label="LOSS" value={lossCount} tone="loss" />
      </div>

      <div className="-mt-1 max-w-[92vw] text-center text-white [text-shadow:0_2px_5px_#000,0_0_10px_#000] sm:-mt-2">
        <p className="text-sm font-bold sm:text-base">{status}</p>
        {signal && signal.signal !== "WAIT" && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-semibold sm:text-xs">
            <span>{signal.symbol}</span>
            <span className={signal.signal === "CALL" ? "text-emerald-300" : "text-red-300"}>
              {signal.signal}
            </span>
            <span>Confiança: {formatConfidence(signal.confidence)}%</span>
            {signal.last_price != null && <span>Preço: {formatPrice(signal.last_price)}</span>}
            {entryValue != null && <span>Entrada: {formatMoney(entryValue)}</span>}
          </div>
        )}
      </div>
    </div>
  );
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
    x: Math.min(Math.max(bounds.minX, position.x), Math.max(bounds.minX, window.innerWidth - width - VIEWPORT_GAP)),
    y: Math.min(Math.max(bounds.minY, position.y), Math.max(bounds.minY, window.innerHeight - height - VIEWPORT_GAP)),
  };
}

function getViewportBounds() {
  return window.innerWidth >= 768
    ? { minX: 256 + VIEWPORT_GAP, minY: VIEWPORT_GAP }
    : { minX: VIEWPORT_GAP, minY: 92 };
}

function readPosition(storageKey: string): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<Position> | null;
    if (typeof value?.x === "number" && typeof value?.y === "number") {
      return { x: value.x, y: value.y };
    }
  } catch {
    return null;
  }
  return null;
}

function formatConfidence(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.round(normalized);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
