import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Settings, Volume2, VolumeX, X } from "lucide-react";
import type { BullExAccountState } from "@/hooks/useBullExAccount";
import type { RobotDirection, RobotState } from "@/hooks/useRobotState";
import { getRobotPresentation } from "@/lib/robotPresentation";
import { readRobotSettings, saveRobotSettings, type RobotSettings } from "@/lib/robotSettings";

type RobotOverlayProps = {
  robotState?: RobotState;
  account?: BullExAccountState;
  narratorEnabled?: boolean;
  narratorSpeaking?: boolean;
  onSilenceNarrator?: () => void;
  onClose?: () => void;
  showConfig?: boolean;
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
  account,
  narratorEnabled = false,
  narratorSpeaking = false,
  onSilenceNarrator,
  onClose,
  showConfig,
  storageKey = "robot-overlay-position",
}: RobotOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [settings, setSettings] = useState<RobotSettings>(() => readRobotSettings());
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
      className={`fixed z-50 flex max-w-[calc(100vw-24px)] touch-none select-none flex-col items-center pb-1 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
      aria-label="Robô flutuante. Arraste para reposicionar."
    >
      <div className="absolute -right-1 -top-7 flex items-center gap-1.5 sm:right-0">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground"
          title={narratorEnabled ? "Narrador ligado" : "Narrador desligado"}
          aria-label={narratorEnabled ? "Narrador ligado" : "Narrador desligado"}
        >
          {narratorEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </span>
        {narratorEnabled && onSilenceNarrator ? (
          <button
            type="button"
            onClick={onSilenceNarrator}
            className={`rounded-full border border-border px-2 py-1 text-[10px] font-semibold transition hover:bg-accent ${
              narratorSpeaking ? "bg-card text-foreground" : "bg-card/80 text-muted-foreground"
            }`}
          >
            Silenciar
          </button>
        ) : null}
        {showConfig ? (
          <button
            type="button"
            onClick={() => {
              setSettings(readRobotSettings());
              setConfigOpen((current) => !current);
            }}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-border bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground transition hover:opacity-90"
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
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-primary text-primary-foreground transition hover:opacity-90"
            aria-label="Esconder overlay do robô"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {configOpen ? (
        <RobotConfigMenu
          settings={settings}
          onChange={setSettings}
          onClose={() => setConfigOpen(false)}
          onSave={() => {
            saveRobotSettings(settings);
            setConfigOpen(false);
          }}
        />
      ) : null}

      <div className="grid grid-cols-[72px_110px_72px] items-center gap-2 sm:grid-cols-[92px_170px_92px] sm:gap-4">
        <Score label="WIN" value={robotState?.wins ?? 0} tone="win" />
        <video
          src="/robo-wink.webm"
          aria-label="Robô analisando o mercado"
          className="pointer-events-none h-auto w-[110px] object-contain [filter:sepia(1)_saturate(7)_hue-rotate(190deg)_brightness(0.72)_contrast(1.45)_drop-shadow(0_0_10px_rgba(0,0,42,0.95))_drop-shadow(0_0_5px_rgba(255,255,255,0.28))] sm:w-[170px]"
          autoPlay
          loop
          muted
          playsInline
        />
        <Score label="LOSS" value={robotState?.losses ?? 0} tone="loss" />
      </div>

      <div className="-mt-1 w-[290px] max-w-[92vw] rounded-xl border border-border bg-card px-3 py-2 text-center text-foreground sm:-mt-2 sm:w-[410px]">
        {account?.connected ? (
          <p className="mb-1 text-[11px] font-semibold sm:text-xs">
            {account.mode ?? "-"}
            {account.balance != null
              ? ` | ${formatAccountBalance(account.balance, account.currency)}`
              : ""}
          </p>
        ) : null}
        <p
          className={`whitespace-normal break-words text-[13px] font-bold leading-snug sm:text-base ${content.tone}`}
        >
          {content.title}
        </p>
        {content.details ? (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 break-words text-[10px] font-semibold leading-snug sm:text-xs">
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

function getOverlayContent(
  robotState: RobotState | undefined,
  now: number,
): OverlayContent {
  const presentation = getRobotPresentation(robotState, now);
  const trade = presentation.trade;
  const signal = presentation.signal;
  const tone =
    presentation.kind === "result"
      ? presentation.result === "WIN"
        ? "text-emerald-300"
        : "text-red-300"
      : presentation.kind === "operation"
        ? "text-amber-200"
        : presentation.kind === "rejected"
          ? "text-red-300"
          : "";

  let details: ReactNode = presentation.detail ? <span>{presentation.detail}</span> : null;

  if (trade) {
    details = (
      <>
        {presentation.detail ? <span>{presentation.detail}</span> : null}
        <TradeIdentity active={trade.active} direction={trade.direction} />
        {presentation.kind === "operation" && trade.amount != null ? (
          <span>Valor: {formatEntryAmount(trade.amount)}</span>
        ) : null}
        {presentation.kind === "result" && trade.profit != null ? (
          <span>
            {presentation.result === "WIN" ? "Lucro" : "Prejuízo"}: {formatMoney(
              presentation.result === "LOSS" ? Math.abs(trade.profit) : trade.profit,
            )}
          </span>
        ) : null}
      </>
    );
  } else if (signal) {
    details = (
      <>
        {presentation.detail ? <span>{presentation.detail}</span> : null}
        <TradeIdentity active={signal.symbol} direction={signal.direction} />
        {signal.confidence != null ? (
          <span>Confiança: {formatPercentage(signal.confidence)}%</span>
        ) : null}
        {signal.payout != null ? <span>Payout: {formatPercentage(signal.payout)}%</span> : null}
      </>
    );
  }

  return {
    title: presentation.title,
    tone,
    details,
    footer: presentation.footer,
  };
}

function TradeIdentity({ active, direction }: { active: string; direction: RobotDirection }) {
  return (
    <>
      <span>Ativo: {active}</span>
      <span className={direction === "CALL" ? "text-emerald-300" : "text-red-300"}>
        Direção: {direction}
      </span>
    </>
  );
}

function RobotConfigMenu({
  settings,
  onChange,
  onSave,
  onClose,
}: {
  settings: RobotSettings;
  onChange: (settings: RobotSettings) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  function updateNumber(key: "entryValue" | "stopWin" | "stopLoss", value: string) {
    const next = Number(value);
    onChange({ ...settings, [key]: Number.isFinite(next) ? next : 0 });
  }

  return (
    <div
      className="absolute right-0 top-2 z-10 w-56 rounded-xl border border-border bg-card p-3 text-foreground"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Config robo
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold hover:bg-accent"
        >
          Fechar
        </button>
      </div>

      <div className="space-y-2">
        <ConfigNumber
          label="Stop Win"
          value={settings.stopWin}
          onChange={(value) => updateNumber("stopWin", value)}
        />
        <ConfigNumber
          label="Stop Loss"
          value={settings.stopLoss}
          onChange={(value) => updateNumber("stopLoss", value)}
        />
        <ConfigNumber
          label="Entrada"
          value={settings.entryValue}
          step="0.5"
          onChange={(value) => updateNumber("entryValue", value)}
        />

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-semibold">
          <span>Usar G1</span>
          <input
            type="checkbox"
            checked={settings.g1}
            onChange={(event) => onChange({ ...settings, g1: event.target.checked })}
            className="h-4 w-4 accent-white"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Salvar
      </button>
    </div>
  );
}

function ConfigNumber({
  label,
  value,
  step = "1",
  onChange,
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring/20"
      />
    </label>
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
  const estimatedWidth = window.innerWidth < 640 ? 290 : 410;
  const estimatedHeight = window.innerWidth < 640 ? 210 : 270;
  const bounds = getViewportBounds();
  return {
    x: Math.max(bounds.minX, bounds.minX + (window.innerWidth - bounds.minX - estimatedWidth) / 2),
    y: Math.max(VIEWPORT_GAP, window.innerHeight - estimatedHeight - 32),
  };
}

function clampPosition(position: Position, element: HTMLDivElement | null): Position {
  const width = element?.offsetWidth ?? (window.innerWidth < 640 ? 290 : 410);
  const height = element?.offsetHeight ?? (window.innerWidth < 640 ? 210 : 270);
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

function formatEntryAmount(value: number) {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

function formatAccountBalance(value: number, currency: string | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(value);
}
