import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Bot, Loader2, Power } from "lucide-react";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { ApiError, apiConfig, robotConfig, robotStart, type ApiResult } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useRobotState } from "@/hooks/useRobotState";
import { getRobotPresentation } from "@/lib/robotPresentation";

export const Route = createFileRoute("/_authenticated/robot")({
  head: () => ({ meta: [{ title: "Robô - BullEx AutoBot" }] }),
  component: RobotPage,
});

const FIXED_CYCLE_MINUTES = 10;
const FIXED_MIN_CONFIDENCE = 80;
const FIXED_MIN_PAYOUT = 80;
const ROBOT_START_AUDIO_SRC = "/robot-start.mp3";

const DEFAULT_CONFIG = {
  stopWin: 50,
  stopLoss: 30,
  entry: 2,
};

function RobotPage() {
  const { user } = useAuth();
  const [robotActionPending, setRobotActionPending] = useState(false);
  const [robotActionError, setRobotActionError] = useState<string | null>(null);
  const robotStartAudioRef = useRef<HTMLAudioElement | null>(null);

  const account = useBullExAccount();
  const robotState = useRobotState(user?.id);
  const robotPresentation = getRobotPresentation(robotState.data, Date.now());

  const connected = account.data?.connected === true;
  const activeMode = account.data?.mode ?? null;
  const realSelected = activeMode === "REAL";
  const robotEnabled = robotState.data?.enabled === true && robotState.data.status !== "STOPPED";
  const hasBackend = !!apiConfig.BASE_URL;

  function playRobotStartAudio() {
    if (typeof Audio === "undefined") return;

    const audio = robotStartAudioRef.current ?? new Audio(ROBOT_START_AUDIO_SRC);
    robotStartAudioRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  async function handleRobotToggle() {
    if (!hasBackend || robotActionPending) return;
    setRobotActionError(null);

    if (!robotEnabled && !connected) {
      setRobotActionError("Conecte sua conta BullEx antes de iniciar o robô.");
      return;
    }

    setRobotActionPending(true);
    try {
      if (robotEnabled) {
        unwrapApiResult(await robotConfig({ enabled: false }));
      } else {
        unwrapApiResult(
          await robotConfig({
            enabled: true,
            account_mode: realSelected ? "REAL" : "DEMO",
            allow_real: realSelected,
            confirm_real: realSelected,
            entry_value: DEFAULT_CONFIG.entry,
            cycle_minutes: FIXED_CYCLE_MINUTES,
            min_confidence: FIXED_MIN_CONFIDENCE,
            min_payout: FIXED_MIN_PAYOUT,
            stop_win: DEFAULT_CONFIG.stopWin,
            stop_loss: DEFAULT_CONFIG.stopLoss,
          }),
        );
        unwrapApiResult(await robotStart());
        playRobotStartAudio();
      }

      await robotState.refetch();
    } catch (error) {
      setRobotActionError(error instanceof Error ? error.message : "Falha ao atualizar o robô.");
    } finally {
      setRobotActionPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bot className="h-6 w-6" /> Robô
          </h1>
          <p className="text-sm text-muted-foreground">Ligue ou pare o AutoBot.</p>
        </div>
        <span className="rounded-md bg-muted px-3 py-1 text-sm">
          Conta: <strong>{activeMode ?? "-"}</strong>
        </span>
      </header>

      {!hasBackend ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong>Backend não configurado.</strong> Defina{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_API_BASE_URL</code>{" "}
          e{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">
            VITE_PANEL_API_KEY
          </code>{" "}
          no ambiente para controlar o robô.
        </div>
      ) : null}

      {!connected ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 text-sm">
          <p className="font-medium text-warning-foreground">Conta BullEx desconectada.</p>
          <p className="mt-1 text-muted-foreground">
            Faça login na página BullEx antes de iniciar o robô.
          </p>
          <Link
            to="/bullex"
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Abrir BullEx
          </Link>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status do robô
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{robotPresentation.title}</h2>
            {robotPresentation.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">{robotPresentation.detail}</p>
            ) : null}
            {robotPresentation.footer ? (
              <p className="mt-1 text-sm font-medium">{robotPresentation.footer}</p>
            ) : null}
          </div>
          <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium">
            {robotEnabled ? "Robô ativo" : "Robô parado"}
          </span>
        </div>

        {robotPresentation.trade ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Pill label="Ativo" value={robotPresentation.trade.active} />
            <Pill label="Direção" value={robotPresentation.trade.direction} />
            {robotPresentation.trade.amount != null ? (
              <Pill label="Entrada" value={`$${formatAmount(robotPresentation.trade.amount)}`} />
            ) : null}
            {robotPresentation.trade.order_id ? (
              <Pill label="Ordem" value={robotPresentation.trade.order_id} />
            ) : null}
          </div>
        ) : null}

        {robotPresentation.signal ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Pill label="Sinal" value={robotPresentation.signal.symbol} />
            <Pill label="Direção" value={robotPresentation.signal.direction} />
            {robotPresentation.signal.confidence != null ? (
              <Pill label="Confiança" value={`${Math.round(robotPresentation.signal.confidence)}%`} />
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRobotToggle}
            disabled={
              !hasBackend ||
              robotActionPending ||
              robotState.isLoading ||
              (!robotEnabled && !connected)
            }
            className={`flex min-w-40 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              robotEnabled
                ? "bg-destructive text-destructive-foreground"
                : "bg-success text-success-foreground"
            }`}
          >
            {robotActionPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Power className="h-4 w-4" />
            )}
            {robotEnabled ? "Parar robô" : "Iniciar robô"}
          </button>
        </div>

        {robotActionError ? (
          <p className="mt-3 text-sm text-destructive">{robotActionError}</p>
        ) : null}
      </section>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-muted px-3 py-1">
      {label}: <strong>{value}</strong>
    </span>
  );
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function unwrapApiResult<T>(result: ApiResult<T>) {
  if (!result.ok) throw new ApiError(result.error, result.code);
  return result.data;
}
