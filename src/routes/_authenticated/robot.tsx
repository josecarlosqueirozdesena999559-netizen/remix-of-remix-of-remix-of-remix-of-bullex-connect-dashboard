import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Power } from "lucide-react";
import { toast } from "sonner";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import {
  ApiError,
  apiConfig,
  robotConfig,
  robotResetCycle,
  robotStart,
  robotStop,
  type ApiResult,
  bullexApi,
  buyReal,
  type BullexBuyRealPayload,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useRobotConnectionSync } from "@/hooks/useRobotConnectionSync";
import { useRobotDisplayState } from "@/hooks/useRobotDisplayState";
import { useRobotState, type RobotState } from "@/hooks/useRobotState";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import { ROBOT_HISTORY_QUERY_KEY, ROBOT_STATS_QUERY_KEY } from "@/hooks/useRobotHistory";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
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
  const [resetCyclePending, setResetCyclePending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [showRealConfirm, setShowRealConfirm] = useState(false);
  const [realConfirmed, setRealConfirmed] = useState(false);
  const [lastHistoryRefreshKey, setLastHistoryRefreshKey] = useState<string | null>(null);
  const [realBuyError, setRealBuyError] = useState<string | null>(null);
  const realBuyAttemptRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const account = useBullExAccount();
  const robotState = useRobotState(user?.id);
  const refetchRobotState = robotState.refetch;
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
  const cachedGrace = displayRobotState?.connection_status_source === "cached_grace";
  const connected = account.data?.connected === true || cachedGrace;
  const activeMode = account.data?.mode ?? null;
  const realSelected = activeMode === "REAL";
  const robotStopped =
    displayRobotState?.status === "STOPPED" ||
    (displayRobotState?.enabled === false && displayRobotState?.worker_running === false);
  const robotEnabled = Boolean(displayRobotState) && !robotStopped;
  const hasBackend = !!apiConfig.BASE_URL;
  const showResetCycle = shouldShowResetCycle(displayRobotState);
  const robotStatusTitle = realBuyError ? "Compra REAL bloqueada" : robotPresentation.title;
  const robotStatusDetail = realBuyError
    ? `Compra REAL bloqueada: ${realBuyError}`
    : robotPresentation.detail;

  function buildRobotConfigPayload(
    overrides: Partial<Parameters<typeof robotConfig>[0]> = {},
  ): Parameters<typeof robotConfig>[0] {
    const currentAccountMode =
      displayRobotState?.account_mode ??
      (activeMode === "REAL" ? "REAL" : activeMode === "PRACTICE" ? "DEMO" : "DEMO");
    const currentAllowReal =
      displayRobotState?.allow_real ??
      (currentAccountMode === "REAL" || activeMode === "REAL");
    const currentConfirmReal =
      displayRobotState?.confirm_real ??
      (currentAccountMode === "REAL" || activeMode === "REAL");

    return {
      enabled: displayRobotState?.enabled ?? false,
      account_mode: currentAccountMode,
      allow_real: currentAllowReal,
      confirm_real: currentConfirmReal,
      entry_value: settings.entryValue,
      cycle_minutes: displayRobotState?.cycle_minutes ?? FIXED_CYCLE_MINUTES,
      min_confidence: FIXED_MIN_CONFIDENCE,
      min_payout: FIXED_MIN_PAYOUT,
      stop_win: settings.stopWin,
      stop_loss: settings.stopLoss,
      martingale_enabled: settings.martingaleEnabled,
      martingale_steps: settings.martingaleSteps,
      martingale_multiplier: settings.martingaleMultiplier,
      ai_analysis_enabled: false,
      ai_confirmation_required: false,
      ai_min_confidence: null,
      ...overrides,
    };
  }

  async function refreshAccountAndRobot() {
    await account.refetch();
    await robotState.refetch();
  }

  useEffect(() => {
    if (!displayRobotState) return;
    const resultStatus =
      displayRobotState.status === "RESULT_RECEIVED" ||
      displayRobotState.status === "GALE_RESULT_RECEIVED";
    const stopLimitReached = getStopLimit(displayRobotState) != null;
    const finalCycleResult =
      displayRobotState.cycle_result === "WIN" ||
      displayRobotState.cycle_result === "LOSS" ||
      displayRobotState.cycle_result === "GALE_WIN" ||
      displayRobotState.cycle_result === "GALE_LOSS";
    const tradeResult =
      displayRobotState.last_trade?.result === "WIN" ||
      displayRobotState.last_trade?.result === "LOSS";

    if (!resultStatus && !stopLimitReached && !finalCycleResult && !tradeResult) return;

    const refreshKey = [
      displayRobotState.cycle_id ?? "-",
      displayRobotState.cycle_result ?? "-",
      displayRobotState.last_trade?.order_id ?? "-",
      displayRobotState.last_trade?.finished_at ?? "-",
      displayRobotState.last_trade?.result ?? "-",
    ].join("|");
    if (lastHistoryRefreshKey === refreshKey) return;
    setLastHistoryRefreshKey(refreshKey);

    void queryClient.invalidateQueries({ queryKey: ROBOT_HISTORY_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ROBOT_STATS_QUERY_KEY });
  }, [
    lastHistoryRefreshKey,
    displayRobotState?.cycle_id,
    displayRobotState?.cycle_result,
    displayRobotState?.last_trade?.finished_at,
    displayRobotState?.last_trade?.order_id,
    displayRobotState?.last_trade?.result,
    displayRobotState?.status,
    displayRobotState?.stop_reason,
    queryClient,
  ]);

  useEffect(() => {
    if (!displayRobotState || !hasBackend || activeMode !== "REAL") {
      realBuyAttemptRef.current = null;
      setRealBuyError(null);
      return;
    }

    if (
      displayRobotState.status === "PENDING_RESULT" ||
      displayRobotState.status === "PENDING_GALE_RESULT" ||
      displayRobotState.last_trade?.result === "PENDING_RESULT"
    ) {
      setRealBuyError(null);
      return;
    }

    const realOrder = getRealBuyPayload(displayRobotState, settings.entryValue);
    if (!realOrder) return;

    const orderKey = createRealBuyKey(displayRobotState, realOrder);
    if (realBuyAttemptRef.current === orderKey) return;
    realBuyAttemptRef.current = orderKey;
    setRealBuyError(null);

    console.log("[FRONT REAL MODE]", {
      accountMode: activeMode,
      robotStatus: displayRobotState.status,
      cycleId: displayRobotState.cycle_id,
    });
    console.log("[FRONT REAL BUY PAYLOAD]", realOrder);

    void (async () => {
      const result = await buyReal(realOrder);
      if (!result.ok) {
        const reason = result.error || result.code || "Motivo nao informado";
        console.error("[FRONT REAL BUY ERROR]", result);
        setRealBuyError(reason);
        await refetchRobotState();
        return;
      }

      console.log("[FRONT REAL BUY SUCCESS]", result.data);
      setRealBuyError(null);
      await refetchRobotState();
    })();
  }, [
    activeMode,
    displayRobotState,
    hasBackend,
    refetchRobotState,
    settings.entryValue,
  ]);

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
      unwrapApiResult(
        await robotConfig(
          buildRobotConfigPayload({
            account_mode: "DEMO",
            allow_real: false,
            confirm_real: false,
          }),
        ),
      );
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
      unwrapApiResult(
        await robotConfig(
          buildRobotConfigPayload({
            account_mode: "REAL",
            allow_real: true,
            confirm_real: true,
          }),
        ),
      );
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
        unwrapApiResult(await robotStop());
      } else {
        if (displayRobotState && getStopLimit(displayRobotState)) {
          unwrapApiResult(await robotConfig({ enabled: false }));
          await robotState.refetch();
        }

        unwrapApiResult(
          await robotConfig(
            buildRobotConfigPayload({
            enabled: true,
            account_mode: realSelected ? "REAL" : "DEMO",
            allow_real: realSelected,
            confirm_real: realSelected,
            cycle_minutes: FIXED_CYCLE_MINUTES,
            min_confidence: FIXED_MIN_CONFIDENCE,
            min_payout: FIXED_MIN_PAYOUT,
            }),
          ),
        );
        unwrapApiResult(await robotStart());
      }

      const nextRobotState = await robotState.refetch();
      if (!nextRobotState.data) {
        throw new Error("Nao foi possivel atualizar o estado do robo.");
      }
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
        accountMode:
          displayRobotState?.account_mode ??
          (activeMode === "REAL" ? "REAL" : activeMode === "PRACTICE" ? "DEMO" : "DEMO"),
        allowReal: displayRobotState?.allow_real ?? activeMode === "REAL",
        confirmReal: displayRobotState?.confirm_real ?? activeMode === "REAL",
      });
      await robotState.refetch();
      toast.success("Configurações salvas");
      setConfigOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar as configurações.";
      setSettingsActionError(message);
      toast.error(message);
    } finally {
      setSettingsActionPending(false);
    }
  }

  async function handleResetCycle() {
    if (!hasBackend || resetCyclePending || !showResetCycle) return;
    setRobotActionError(null);
    setResetCyclePending(true);
    try {
      unwrapApiResult(await robotResetCycle());
      await robotState.refetch();
      await queryClient.invalidateQueries({ queryKey: ROBOT_HISTORY_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ROBOT_STATS_QUERY_KEY });
      toast.success("Ciclo reiniciado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível reiniciar o ciclo.";
      setRobotActionError(message);
      toast.error(message);
    } finally {
      setResetCyclePending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl min-w-0 space-y-6">
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
            <h2 className="mt-1 text-2xl font-semibold">{robotStatusTitle}</h2>
            {robotStatusDetail ? (
              <p
                className={`mt-1 text-sm ${
                  realBuyError ? "font-medium text-destructive" : "text-muted-foreground"
                }`}
              >
                {robotStatusDetail}
              </p>
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

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-40 sm:w-auto ${
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
          <button
            type="button"
            onClick={() => {
              setSettingsActionError(null);
              setConfigOpen((current) => !current);
            }}
            className="w-full rounded-xl border border-border bg-background/40 px-5 py-3 font-semibold transition hover:bg-accent sm:w-auto"
          >
            {configOpen ? "Fechar configurações" : "Abrir configurações"}
          </button>
        </div>

        {robotActionError ? (
          <p className="mt-3 text-sm text-destructive">{robotActionError}</p>
        ) : null}

        {showResetCycle ? (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
            <p className="text-sm font-medium text-warning-foreground">
              Stop atingido. Reinicie o ciclo para continuar.
            </p>
            <button
              type="button"
              onClick={handleResetCycle}
              disabled={resetCyclePending}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetCyclePending ? "Reiniciando..." : "Reiniciar ciclo"}
            </button>
          </div>
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

      {configOpen ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Configurações do robô</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajuste stops, entrada e parâmetros de gale.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ConfigField
              label="Stop Win"
              value={settings.stopWin}
              onChange={(value) =>
                setSettings({ ...settings, stopWin: normalizeConfigNumber(value, settings.stopWin) })
              }
            />
            <ConfigField
              label="Stop Loss"
              value={settings.stopLoss}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  stopLoss: normalizeConfigNumber(value, settings.stopLoss),
                })
              }
            />
            <ConfigField
              label="Valor por entrada"
              value={settings.entryValue}
              step="0.5"
              onChange={(value) =>
                setSettings({
                  ...settings,
                  entryValue: normalizeConfigNumber(value, settings.entryValue),
                })
              }
            />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-medium">
              <span>Gale ativado</span>
              <input
                type="checkbox"
                checked={settings.martingaleEnabled}
                onChange={(event) =>
                  setSettings({ ...settings, martingaleEnabled: event.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
            </label>
            <ConfigField
              label="Quantidade de Gales"
              value={settings.martingaleSteps}
              step="1"
              onChange={(value) =>
                setSettings({
                  ...settings,
                  martingaleSteps: normalizeConfigInteger(value, settings.martingaleSteps),
                })
              }
            />
            <ConfigField
              label="Multiplicador do Gale"
              value={settings.martingaleMultiplier}
              step="0.1"
              onChange={(value) =>
                setSettings({
                  ...settings,
                  martingaleMultiplier: normalizeConfigNumber(value, settings.martingaleMultiplier),
                })
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAiSettings}
              disabled={!hasBackend || settingsActionPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settingsActionPending ? "Salvando..." : "Salvar configurações"}
            </button>
            {settingsActionError ? (
              <p className="text-sm text-destructive">{settingsActionError}</p>
            ) : null}
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

function ConfigField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <label className="block rounded-xl border border-border bg-background/40 px-4 py-3">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring/20"
      />
    </label>
  );
}

function normalizeConfigNumber(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
}

function normalizeConfigInteger(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(1, Math.round(next));
}

function getRealBuyPayload(
  robotState: RobotState,
  fallbackAmount: number,
): BullexBuyRealPayload | null {
  if (!shouldSendRealBuy(robotState)) return null;

  const isGale = robotState.status === "SENDING_GALE_ORDER" || robotState.gale_in_progress;
  const assetId = isGale
    ? robotState.gale_active ?? robotState.last_trade?.active
    : robotState.pending_signal?.symbol;
  const direction = isGale
    ? robotState.gale_direction ?? robotState.last_trade?.direction
    : robotState.pending_signal?.direction;
  const amount = isGale
    ? robotState.gale_amount ?? robotState.last_trade?.amount ?? fallbackAmount
    : robotState.entry_value ?? fallbackAmount;
  const duration = robotState.cycle_minutes || FIXED_CYCLE_MINUTES;

  if (!assetId || (direction !== "CALL" && direction !== "PUT")) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return {
    asset_id: assetId,
    direction,
    amount,
    duration,
    confirm_real: true,
  };
}

function shouldSendRealBuy(robotState: RobotState) {
  if (robotState.account_mode !== "REAL") return false;
  if (!robotState.allow_real || !robotState.confirm_real) return false;
  if (robotState.result_waiting) return false;
  if (
    robotState.status === "PENDING_RESULT" ||
    robotState.status === "PENDING_GALE_RESULT" ||
    robotState.last_trade?.result === "PENDING_RESULT"
  ) {
    return false;
  }

  return (
    robotState.status === "SENDING_ORDER" ||
    robotState.status === "SENDING_GALE_ORDER" ||
    (robotState.entry_window_open && robotState.pending_signal != null)
  );
}

function createRealBuyKey(robotState: RobotState, payload: BullexBuyRealPayload) {
  return [
    robotState.cycle_id ?? "-",
    robotState.status,
    robotState.gale_step ?? 0,
    payload.asset_id,
    payload.direction,
    payload.amount,
    payload.duration,
  ].join("|");
}

function shouldShowResetCycle(robotState: RobotState | undefined) {
  if (!robotState) return false;
  return [robotState.last_rejection_reason, robotState.rejection_reason].some((reason) =>
    reason === "STOP_WIN_HIT" || reason === "STOP_LOSS_HIT",
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
