import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { RotateCcw, Settings, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import type { BullExAccountState } from "@/hooks/useBullExAccount";
import type { RobotDirection, RobotState } from "@/hooks/useRobotState";
import { getRobotPresentation } from "@/lib/robotPresentation";
import {
  DEFAULT_ROBOT_SETTINGS,
  ENTRY_VALUE_MAX,
  ENTRY_VALUE_MIN,
  ENTRY_VALUE_STEP,
  type RobotSettings,
} from "@/lib/robotSettings";

type RobotOverlayProps = {
  robotState?: RobotState;
  account?: BullExAccountState;
  narratorEnabled?: boolean;
  narratorSpeaking?: boolean;
  onSilenceNarrator?: () => void;
  settings?: RobotSettings;
  onSettingsChange?: (settings: RobotSettings) => void | Promise<void>;
  onClose?: () => void;
  showConfig?: boolean;
  adminModelControls?: {
    onAddWin: () => void;
    onResetScore: () => void;
  } | null;
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
  settings: savedSettings = DEFAULT_ROBOT_SETTINGS,
  onSettingsChange,
  onClose,
  showConfig,
  adminModelControls,
}: RobotOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<Position>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [settings, setSettings] = useState<RobotSettings>(savedSettings);
  const now = useCurrentTime();
  const presentation = getRobotPresentation(robotState, now);
  const content = getOverlayContent(robotState, presentation);
  const settingsLocked = isRobotActive(robotState);

  useEffect(() => {
    setSettings(savedSettings);
  }, [savedSettings]);

  const lastCountdownLogRef = useRef<string | null>(null);
  const lastWaitingUiLogRef = useRef<string | null>(null);
  const lastSendingUiLogRef = useRef<string | null>(null);

  useEffect(() => {
    if (!robotState || robotState.status !== "WAITING_NEXT_CANDLE_ENTRY") return;
    const logKey = [
      robotState.status,
      robotState.cycle_id ?? "-",
      robotState.pending_signal?.symbol ?? "-",
      robotState.pending_signal?.direction ?? "-",
    ].join("|");
    if (lastWaitingUiLogRef.current === logKey) return;
    lastWaitingUiLogRef.current = logKey;
    console.log("[WAITING_NEXT_CANDLE_ENTRY_UI]", {
      cycleId: robotState.cycle_id ?? null,
      symbol: robotState.pending_signal?.symbol ?? null,
      direction: robotState.pending_signal?.direction ?? null,
    });
  }, [robotState]);

  useEffect(() => {
    if (!robotState || robotState.status !== "WAITING_NEXT_CANDLE_ENTRY") return;
    const logKey = [robotState.cycle_id ?? "-", smoothEntryWindowSeconds ?? "null"].join("|");
    if (lastCountdownLogRef.current === logKey) return;
    lastCountdownLogRef.current = logKey;
    console.log("[NEXT_CANDLE_COUNTDOWN]", {
      cycleId: robotState.cycle_id ?? null,
      secondsUntilEntry: smoothEntryWindowSeconds,
    });
  }, [robotState, smoothEntryWindowSeconds]);

  useEffect(() => {
    if (!robotState || robotState.status !== "SENDING_ORDER") return;
    const logKey = [
      robotState.status,
      robotState.cycle_id ?? "-",
      robotState.pending_signal?.symbol ?? "-",
      robotState.pending_signal?.direction ?? "-",
      robotState.last_trade?.order_id ?? "-",
    ].join("|");
    if (lastSendingUiLogRef.current === logKey) return;
    lastSendingUiLogRef.current = logKey;
    console.log("[SENDING_ORDER_UI]", {
      cycleId: robotState.cycle_id ?? null,
      symbol: robotState.pending_signal?.symbol ?? null,
      direction: robotState.pending_signal?.direction ?? null,
      orderId: robotState.last_trade?.order_id ?? null,
    });
  }, [robotState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPosition(clampPosition(getDefaultPosition(), overlayRef.current));
    });

    const handleResize = () => {
      setPosition((current) => clampPosition(current ?? getDefaultPosition(), overlayRef.current));
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
          {narratorEnabled ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
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
              setSettings(savedSettings);
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
          locked={settingsLocked}
          onChange={setSettings}
          onClose={() => setConfigOpen(false)}
          onSave={async () => {
            if (settingsLocked) {
              toast.error("Pare o robô para alterar configurações.");
              return;
            }
            try {
              await Promise.resolve(onSettingsChange?.(settings));
              toast.success("Configurações salvas");
              setConfigOpen(false);
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Não foi possível salvar as configurações.";
              toast.error(message);
              console.error("[ROBOT CONFIG SAVE ERROR]", error);
              throw error;
            }
          }}
        />
      ) : null}

      <div className="grid grid-cols-[72px_110px_72px] items-center gap-2 sm:grid-cols-[92px_170px_92px] sm:gap-4">
        <Score label="WIN" value={robotState?.wins ?? 0} tone="win" />
        <video
          src="/robo-wink.webm"
          aria-label="Robô analisando o mercado"
          className="pointer-events-none h-auto w-[110px] object-contain [filter:hue-rotate(175deg)_saturate(1.35)_brightness(1.02)_contrast(1.14)_drop-shadow(0_0_14px_rgba(37,99,235,0.45))_drop-shadow(0_0_6px_rgba(125,211,252,0.25))] sm:w-[170px]"
          autoPlay
          loop
          muted
          playsInline
        />
        <Score label="LOSS" value={robotState?.losses ?? 0} tone="loss" />
      </div>

      <div className="-mt-1 w-[290px] max-w-[92vw] px-3 py-2 text-center text-foreground [text-shadow:0_2px_5px_rgba(0,0,0,0.85)] sm:-mt-2 sm:w-[410px]">
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
        {adminModelControls ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={adminModelControls.onAddWin}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-500/30 sm:text-xs"
            >
              <Trophy className="h-3 w-3" />
              WIN +1
            </button>
            <button
              type="button"
              onClick={adminModelControls.onResetScore}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[10px] font-bold text-foreground transition hover:bg-accent sm:text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Resetar placar
            </button>
          </div>
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

function formatRobotStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatOfficialCountdown(robotState: RobotState | undefined) {
  if (!robotState) return "-";
  const seconds =
    robotState.display_countdown_seconds ??
    (hasOpenOperation(robotState)
      ? robotState.expiration_seconds
      : (robotState.pending_signal ?? robotState.best_candidate)
        ? robotState.seconds_until_entry || robotState.seconds_until_entry_window
        : robotState.seconds_until_analysis_window || robotState.seconds_until_next_cycle);

  return seconds > 0 ? formatClock(seconds) : "-";
}

function hasOpenOperation(robotState: RobotState) {
  return (
    robotState.operation_in_progress ||
    robotState.result_waiting ||
    robotState.status === "ORDER_OPEN" ||
    robotState.status === "WAITING_RESULT" ||
    robotState.status === "PENDING_RESULT" ||
    robotState.last_trade?.result === "PENDING_RESULT"
  );
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function getOverlayContent(
  robotState: RobotState | undefined,
  presentation: ReturnType<typeof getRobotPresentation>,
): OverlayContent {
  const trade = presentation.trade;
  const signal = presentation.signal;
  const isPositiveResult = presentation.result === "WIN";
  const isNegativeResult = presentation.result === "LOSS";
  const tone =
    presentation.kind === "result"
      ? isPositiveResult
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
        <OfficialStateDetails robotState={robotState} />
        {trade.confidence != null ? (
          <span>Confiança: {formatPercentage(trade.confidence)}%</span>
        ) : null}
        {trade.payout != null ? <span>Payout: {formatPercentage(trade.payout)}%</span> : null}
        {trade.amount != null ? <span>Valor: {formatEntryAmount(trade.amount)}</span> : null}
        {presentation.kind === "result" && trade.profit != null ? (
          <span>
            {isPositiveResult ? "Lucro" : "Prejuízo"}:{" "}
            {formatMoney(isNegativeResult ? Math.abs(trade.profit) : trade.profit)}
          </span>
        ) : null}
      </>
    );
  } else if (presentation.gale) {
    details = (
      <>
        <span>Mesmo ativo: {presentation.gale.active}</span>
        <span
          className={presentation.gale.direction === "CALL" ? "text-emerald-300" : "text-red-300"}
        >
          Mesma direção: {presentation.gale.direction}
        </span>
        <OfficialStateDetails robotState={robotState} />
        {presentation.gale.amount != null ? (
          <span>Valor: {formatEntryAmount(presentation.gale.amount)}</span>
        ) : null}
      </>
    );
  } else if (signal) {
    const usedStrategies =
      signal.used_strategies.length > 0
        ? signal.used_strategies
        : [signal.strategy_name ?? "Não informada"];
    details = (
      <>
        {presentation.detail ? <span>{presentation.detail}</span> : null}
        <TradeIdentity active={signal.symbol} direction={signal.direction} />
        <OfficialStateDetails robotState={robotState} />
        {signal.strategy_score != null ? (
          <span>Score: {formatScore(signal.strategy_score)}</span>
        ) : null}
        {signal.confidence != null ? (
          <span>Confiança: {formatPercentage(signal.confidence)}%</span>
        ) : null}
        {signal.payout != null ? <span>Payout: {formatPercentage(signal.payout)}%</span> : null}
        {robotState?.entry_value != null ? (
          <span>Valor: {formatEntryAmount(robotState.entry_value)}</span>
        ) : null}
        <span>Estratégia: {usedStrategies.join(", ")}</span>
        {signal.reason || signal.strategy_reason ? (
          <span>Motivo: {signal.reason ?? signal.strategy_reason ?? "Nao informado"}</span>
        ) : null}
      </>
    );
  } else if (robotState) {
    details = (
      <>
        {presentation.detail ? <span>{presentation.detail}</span> : null}
        <OfficialStateDetails robotState={robotState} />
      </>
    );
  }

  return {
    title: formatOverlayTitle(robotState, presentation.title),
    tone,
    details,
    footer: presentation.footer,
  };
}

function formatOverlayTitle(robotState: RobotState | undefined, title: string) {
  if (robotState?.last_trade?.is_gale && robotState.last_trade.result === "LOSS") {
    return "LOSS no Gale";
  }

  return title;
}

function isRobotActive(robotState: RobotState | undefined) {
  if (!robotState) return false;
  const stopped =
    robotState.status === "STOPPED" ||
    (robotState.enabled === false && robotState.worker_running === false);
  return !stopped;
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

function OfficialStateDetails({ robotState }: { robotState: RobotState | undefined }) {
  if (!robotState) return null;
  return (
    <>
      <span>Status atual: {formatRobotStatus(robotState.status)}</span>
      <span>Contador oficial: {formatOfficialCountdown(robotState)}</span>
    </>
  );
}

function RobotConfigMenu({
  settings,
  locked,
  onChange,
  onSave,
  onClose,
}: {
  settings: RobotSettings;
  locked: boolean;
  onChange: (settings: RobotSettings) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  function updateNumber(
    key: "entryValue" | "stopWin" | "stopLoss" | "martingaleSteps" | "martingaleMultiplier",
    value: string,
  ) {
    const next = Number(value);
    const normalized =
      key === "entryValue"
        ? Number.isFinite(next)
          ? Math.min(ENTRY_VALUE_MAX, Math.max(ENTRY_VALUE_MIN, Math.round(next)))
          : settings.entryValue
        : key === "martingaleSteps"
          ? Number.isFinite(next)
            ? Math.max(1, Math.round(next))
            : settings.martingaleSteps
          : Number.isFinite(next)
            ? next
            : settings[key];
    onChange({ ...settings, [key]: normalized });
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

      {locked ? (
        <p className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] font-semibold text-warning-foreground">
          Pare o robô para alterar configurações.
        </p>
      ) : null}

      <div className="space-y-2">
        <ConfigNumber
          label="Stop Win"
          value={settings.stopWin}
          disabled={locked}
          onChange={(value) => updateNumber("stopWin", value)}
        />
        <ConfigNumber
          label="Stop Loss"
          value={settings.stopLoss}
          disabled={locked}
          onChange={(value) => updateNumber("stopLoss", value)}
        />
        <ConfigNumber
          label="Valor por entrada"
          value={settings.entryValue}
          min={ENTRY_VALUE_MIN}
          max={ENTRY_VALUE_MAX}
          step={ENTRY_VALUE_STEP}
          helperText={`Valor minimo: ${formatCurrencyBRL(ENTRY_VALUE_MIN)}\nValor maximo: ${formatCurrencyBRL(ENTRY_VALUE_MAX)}`}
          disabled={locked}
          onChange={(value) => updateNumber("entryValue", value)}
        />

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-semibold">
          <span>Gale ativado</span>
          <input
            type="checkbox"
            checked={settings.martingaleEnabled}
            disabled={locked}
            onChange={(event) => onChange({ ...settings, martingaleEnabled: event.target.checked })}
            className="h-4 w-4 accent-white disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <ConfigNumber
          label="Quantidade de Gales"
          value={settings.martingaleSteps}
          step="1"
          disabled={locked}
          onChange={(value) => updateNumber("martingaleSteps", value)}
        />
        <ConfigNumber
          label="Multiplicador do Gale"
          value={settings.martingaleMultiplier}
          step="0.1"
          disabled={locked}
          onChange={(value) => updateNumber("martingaleMultiplier", value)}
        />
      </div>

      <button
        type="button"
        onClick={async () => {
          if (saving || locked) return;
          setSaving(true);
          try {
            await onSave();
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving || locked}
        className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar configurações"}
      </button>
    </div>
  );
}

function ConfigNumber({
  label,
  value,
  step = 1,
  min = 0,
  max,
  helperText,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  step?: number | string;
  min?: number;
  max?: number;
  helperText?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {helperText ? (
        <span className="mt-1 block whitespace-pre-line text-[11px] text-muted-foreground">
          {helperText}
        </span>
      ) : null}
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

function formatPercentage(value: number) {
  return Math.round(value);
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
