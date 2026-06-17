import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Loader2, Power } from "lucide-react";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { ApiError, apiConfig, robotConfig, robotStart, type ApiResult, bullexApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useRobotConnectionSync } from "@/hooks/useRobotConnectionSync";
import { useRobotDisplayState } from "@/hooks/useRobotDisplayState";
import { useRobotState, type RobotState } from "@/hooks/useRobotState";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import { getRobotAiReview } from "@/lib/robotAi";
import { getRobotPresentation } from "@/lib/robotPresentation";

export const Route = createFileRoute("/_authenticated/robot")({
  head: () => ({ meta: [{ title: "Robô - BullEx AutoBot" }] }),
  component: RobotPage,
});

const FIXED_CYCLE_MINUTES = 5;
const FIXED_MIN_CONFIDENCE = 80;
const FIXED_MIN_PAYOUT = 80;

function RobotPage() {
  const { user } = useAuth();
  const [robotActionPending, setRobotActionPending] = useState(false);
  const [robotActionError, setRobotActionError] = useState<string | null>(null);
  const [modeActionPending, setModeActionPending] = useState(false);
  const [modeActionError, setModeActionError] = useState<string | null>(null);
  const [settingsActionPending, setSettingsActionPending] = useState(false);
  const [settingsActionError, setSettingsActionError] = useState<string | null>(null);
  const [showRealConfirm, setShowRealConfirm] = useState(false);
  const [realConfirmed, setRealConfirmed] = useState(false);

  const account = useBullExAccount();
  const robotState = useRobotState(user?.id);
  const effectiveRobotState = useRobotConnectionSync({
    userId: user?.id,
    accountConnected: account.data?.connected === true,
    robotState: robotState.data,
  });
  const displayRobotState = useRobotDisplayState(effectiveRobotState);
  const { settings, setSettings, saveSettings } = useRobotSettings(user?.id);
  const now = useCurrentTime();
  const analysisWindowSeconds = useSmoothCountdown(
    displayRobotState?.seconds_until_analysis_window,
    getAnalysisWindowResetKey(displayRobotState),
    Boolean(displayRobotState?.enabled && displayRobotState.seconds_until_analysis_window > 0),
    displayRobotState?.fetched_at,
  );
  const nextCycleSeconds = useSmoothCountdown(
    displayRobotState?.display_countdown_seconds ?? displayRobotState?.seconds_until_next_cycle,
    getNextCycleResetKey(displayRobotState),
    Boolean(
      displayRobotState?.enabled &&
      (displayRobotState.display_countdown_seconds ?? displayRobotState.seconds_until_next_cycle) >
        0,
    ),
    displayRobotState?.fetched_at,
  );
  const smoothEntryWindowSeconds = useSmoothCountdown(
    displayRobotState?.seconds_until_entry ?? displayRobotState?.seconds_until_entry_window,
    getEntryWindowResetKey(displayRobotState),
    Boolean(
      displayRobotState?.enabled &&
      (displayRobotState.seconds_until_entry ?? displayRobotState.seconds_until_entry_window) > 0,
    ),
    displayRobotState?.fetched_at,
  );
  const smoothExpirationSeconds = useSmoothCountdown(
    displayRobotState?.expiration_seconds,
    getExpirationResetKey(displayRobotState),
    Boolean(
      displayRobotState?.enabled &&
      (displayRobotState.operation_in_progress ||
        displayRobotState.status === "PENDING_RESULT" ||
        displayRobotState.last_trade?.result === "PENDING_RESULT") &&
      displayRobotState.expiration_seconds > 0,
    ),
    displayRobotState?.fetched_at,
  );
  const robotPresentation = getRobotPresentation(displayRobotState, now, {
    analysisWindowSeconds,
    nextCycleSeconds,
    entryWindowSeconds: smoothEntryWindowSeconds,
    expirationSeconds: smoothExpirationSeconds,
  });
  const syncing = account.isLoading || robotState.isLoading;
  const aiReview = getRobotAiReview(
    robotPresentation.signal ??
      displayRobotState?.pending_signal ??
      displayRobotState?.last_signal ??
      displayRobotState?.best_candidate,
  );
  const cachedGrace = displayRobotState?.connection_status_source === "cached_grace";
  const connected = account.data?.connected === true || cachedGrace;
  const activeMode = account.data?.mode ?? null;
  const realSelected = activeMode === "REAL";
  const robotEnabled =
    displayRobotState?.enabled === true && displayRobotState.status !== "STOPPED";
  const hasBackend = !!apiConfig.BASE_URL;

  async function refreshAccountAndRobot() {
    await account.refetch();
    await robotState.refetch();
  }

  async function handleDemoMode() {
    if (!hasBackend || syncing || !connected || modeActionPending || activeMode === "PRACTICE") {
      return;
    }
    setModeActionError(null);
    setShowRealConfirm(false);
    setRealConfirmed(false);
    setModeActionPending(true);
    try {
      unwrapApiResult(await bullexApi.changeMode({ mode: "PRACTICE" }));
      await refreshAccountAndRobot();
    } catch (error) {
      setModeActionError(
        error instanceof Error ? error.message : "Nao foi possivel mudar para DEMO.",
      );
    } finally {
      setModeActionPending(false);
    }
  }

  function handleRealMode() {
    if (!hasBackend || syncing || !connected || modeActionPending || activeMode === "REAL") return;
    setModeActionError(null);
    setRealConfirmed(false);
    setShowRealConfirm(true);
  }

  async function confirmRealMode() {
    if (!realConfirmed || modeActionPending) return;
    setModeActionError(null);
    setModeActionPending(true);
    try {
      unwrapApiResult(await bullexApi.changeMode({ mode: "REAL", confirm_real: true }));
      setShowRealConfirm(false);
      setRealConfirmed(false);
      await refreshAccountAndRobot();
    } catch (error) {
      setModeActionError(
        error instanceof Error ? error.message : "Nao foi possivel mudar para REAL.",
      );
    } finally {
      setModeActionPending(false);
    }
  }

  async function handleRobotToggle() {
    if (!hasBackend || robotActionPending) return;
    setRobotActionError(null);

    if (!syncing && !robotEnabled && !connected) {
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
            entry_value: settings.entryValue,
            cycle_minutes: FIXED_CYCLE_MINUTES,
            min_confidence: FIXED_MIN_CONFIDENCE,
            min_payout: FIXED_MIN_PAYOUT,
            stop_win: settings.stopWin,
            stop_loss: settings.stopLoss,
            martingale_enabled: settings.martingaleEnabled,
            martingale_steps: 1,
            martingale_multiplier: settings.martingaleMultiplier,
            ai_analysis_enabled: settings.aiAnalysisEnabled,
            ai_confirmation_required: settings.aiConfirmationRequired,
            ai_min_confidence: settings.aiMinConfidence,
          }),
        );
        unwrapApiResult(await robotStart());
      }

      await robotState.refetch();
    } catch (error) {
      setRobotActionError(error instanceof Error ? error.message : "Falha ao atualizar o robô.");
    } finally {
      setRobotActionPending(false);
    }
  }

  async function handleSaveAiSettings() {
    if (!user?.id || !hasBackend || settingsActionPending) return;
    setSettingsActionError(null);
    setSettingsActionPending(true);
    try {
      await saveSettings(settings, {
        enabled: displayRobotState?.enabled ?? false,
        cycleMinutes: displayRobotState?.cycle_minutes ?? FIXED_CYCLE_MINUTES,
      });
    } catch (error) {
      setSettingsActionError(
        error instanceof Error ? error.message : "Nao foi possivel salvar a configuracao da IA.",
      );
    } finally {
      setSettingsActionPending(false);
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

      {!syncing && !connected ? (
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

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Tipo de conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">Escolha onde o robo vai operar.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-80">
            <button
              type="button"
              onClick={handleDemoMode}
              disabled={!hasBackend || syncing || !connected || modeActionPending}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                activeMode === "PRACTICE"
                  ? "bg-success text-success-foreground"
                  : "border border-border bg-background/40 text-foreground hover:bg-accent"
              }`}
            >
              DEMO
            </button>
            <button
              type="button"
              onClick={handleRealMode}
              disabled={!hasBackend || syncing || !connected || modeActionPending}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                activeMode === "REAL"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background/40 text-foreground hover:bg-accent"
              }`}
            >
              REAL
            </button>
          </div>
        </div>

        {modeActionError ? (
          <p className="mt-3 text-sm text-destructive">{modeActionError}</p>
        ) : null}
      </section>

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

        {robotPresentation.gale ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Pill label="Mesmo ativo" value={robotPresentation.gale.active} />
            <Pill label="Mesma direção" value={robotPresentation.gale.direction} />
            {robotPresentation.gale.amount != null ? (
              <Pill label="Valor" value={`$${formatAmount(robotPresentation.gale.amount)}`} />
            ) : null}
          </div>
        ) : null}

        {robotPresentation.signal ? (
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Pill label="Ativo" value={robotPresentation.signal.symbol} />
              <Pill label="Direção" value={robotPresentation.signal.direction} />
              {robotPresentation.signal.strategy_score != null ? (
                <Pill label="Score" value={formatScore(robotPresentation.signal.strategy_score)} />
              ) : null}
              {robotPresentation.signal.confidence != null ? (
                <Pill
                  label="Confiança"
                  value={`${Math.round(robotPresentation.signal.confidence)}%`}
                />
              ) : null}
              {robotPresentation.signal.payout != null ? (
                <Pill label="Payout" value={`${Math.round(robotPresentation.signal.payout)}%`} />
              ) : null}
              <Pill
                label="Estratégia"
                value={
                  robotPresentation.signal.used_strategies.length > 0
                    ? robotPresentation.signal.used_strategies.join(", ")
                    : (robotPresentation.signal.strategy_name ?? "Não informada")
                }
              />
            </div>
            {(robotPresentation.signal.reason || robotPresentation.signal.strategy_reason) && (
              <p className="text-muted-foreground">
                Motivo da entrada:{" "}
                {robotPresentation.signal.reason ??
                  robotPresentation.signal.strategy_reason ??
                  "Nao informado"}
              </p>
            )}
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
              syncing ||
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

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Narrador do robo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fala eventos importantes enquanto esta aba estiver aberta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, narratorEnabled: !settings.narratorEnabled })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              settings.narratorEnabled
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background/40 text-muted-foreground hover:bg-accent"
            }`}
          >
            {settings.narratorEnabled ? "Ligado" : "Desligado"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Analise com IA</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Usa a OpenAI para revisar a leitura dos candles sem travar a tela.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-medium">
            <span>Usar IA para analisar candles</span>
            <input
              type="checkbox"
              checked={settings.aiAnalysisEnabled}
              onChange={(event) =>
                setSettings({ ...settings, aiAnalysisEnabled: event.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-medium">
            <span>Exigir aprovacao da IA</span>
            <input
              type="checkbox"
              checked={settings.aiConfirmationRequired}
              onChange={(event) =>
                setSettings({ ...settings, aiConfirmationRequired: event.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="block rounded-xl border border-border bg-background/40 px-4 py-3">
            <span className="mb-2 block text-sm font-medium">Confianca minima da IA</span>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={settings.aiMinConfidence}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  aiMinConfidence: clampPercentage(event.target.value, settings.aiMinConfidence),
                })
              }
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring/20"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveAiSettings}
            disabled={!hasBackend || settingsActionPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {settingsActionPending ? "Salvando..." : "Salvar configuracao da IA"}
          </button>
          {settingsActionError ? (
            <p className="text-sm text-destructive">{settingsActionError}</p>
          ) : null}
        </div>
      </section>

      {aiReview ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">Analise OpenAI</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leitura complementar da IA para o sinal atual.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Pill label="IA" value={aiReview.statusLabel} />
            {aiReview.confidenceLabel ? (
              <Pill label="Confianca IA" value={aiReview.confidenceLabel} />
            ) : null}
            {aiReview.riskLabel ? <Pill label="Risco" value={aiReview.riskLabel} /> : null}
          </div>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {aiReview.candleReadingLabel ? (
              <p>Leitura dos candles: {aiReview.candleReadingLabel}</p>
            ) : null}
            {aiReview.entryReasonLabel ? (
              <p>Motivo da entrada: {aiReview.entryReasonLabel}</p>
            ) : null}
            {aiReview.blockMessage ? <p className="text-destructive">{aiReview.blockMessage}</p> : null}
            {aiReview.fallbackMessage ? <p>{aiReview.fallbackMessage}</p> : null}
          </div>
        </section>
      ) : null}

      {showRealConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Confirmar conta REAL</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Entendo que estou mudando para CONTA REAL. As operacoes usarao saldo real e podem
              gerar perdas.
            </p>

            <label className="mt-5 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={realConfirmed}
                onChange={(event) => setRealConfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>Confirmo que quero operar em conta REAL.</span>
            </label>

            {modeActionError ? (
              <p className="mt-3 text-sm text-destructive">{modeActionError}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRealConfirm(false);
                  setRealConfirmed(false);
                }}
                disabled={modeActionPending}
                className="rounded-lg border border-border bg-background/40 px-4 py-2 text-sm font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRealMode}
                disabled={!realConfirmed || modeActionPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modeActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar conta REAL
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function clampPercentage(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(100, Math.max(1, Math.round(next)));
}

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function getAnalysisWindowResetKey(robotState: RobotState | undefined) {
  if (!robotState) return null;
  return [robotState.status, robotState.next_cycle_at ?? "-"].join("|");
}

function getNextCycleResetKey(robotState: RobotState | undefined) {
  if (!robotState) return null;
  return [
    robotState.status,
    robotState.next_cycle_at ?? "-",
    robotState.display_countdown_label ?? "-",
    robotState.last_trade?.finished_at ?? "-",
  ].join("|");
}

function getEntryWindowResetKey(robotState: RobotState | undefined) {
  if (!robotState) return null;
  return [
    robotState.status,
    robotState.cycle_id ?? "-",
    robotState.pending_signal?.created_at ?? "-",
    robotState.pending_signal?.symbol ?? "-",
    robotState.pending_signal?.direction ?? "-",
  ].join("|");
}

function getExpirationResetKey(robotState: RobotState | undefined) {
  if (!robotState) return null;
  return [
    robotState.status,
    robotState.last_trade?.order_id ?? "-",
    robotState.last_trade?.sent_at ?? "-",
    robotState.last_trade?.expires_at ?? robotState.expires_at ?? "-",
  ].join("|");
}

function unwrapApiResult<T>(result: ApiResult<T>) {
  if (!result.ok) throw new ApiError(result.error, result.code);
  return result.data;
}
