import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Power } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  apiConfig,
  robotConfig,
  robotResetCycle,
  robotStart,
  robotStop,
  type ApiResult,
  buyReal,
  type BullexBuyRealPayload,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useLiveTradingData } from "@/hooks/useLiveTradingData";
import { useRobotDisplayState } from "@/hooks/useRobotDisplayState";
import type { RobotState } from "@/hooks/useRobotState";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import { ROBOT_HISTORY_QUERY_KEY, ROBOT_STATS_QUERY_KEY } from "@/hooks/useRobotHistory";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import { getRobotPresentation } from "@/lib/robotPresentation";
import { ENTRY_VALUE_MAX, ENTRY_VALUE_MIN, ENTRY_VALUE_STEP } from "@/lib/robotSettings";
import { useBullExLoginState } from "@/lib/bullexLoginState";

export const Route = createFileRoute("/_authenticated/robot")({
  head: () => ({ meta: [{ title: "Robô - BullEx AutoBot" }] }),
  component: RobotPage,
});

const FIXED_CYCLE_MINUTES = 5;
const FIXED_MIN_CONFIDENCE = 80;
const FIXED_MIN_PAYOUT = 80;
const INSUFFICIENT_BALANCE_MESSAGE =
  "Você está sem saldo para iniciar. Faça um depósito na BullEx.";

function RobotPage() {
  const { user } = useAuth();
  const loginFlow = useBullExLoginState(user?.id);
  const [robotActionPending, setRobotActionPending] = useState(false);
  const [robotActionError, setRobotActionError] = useState<string | null>(null);
  const [settingsActionPending, setSettingsActionPending] = useState(false);
  const [settingsActionError, setSettingsActionError] = useState<string | null>(null);
  const [resetCyclePending, setResetCyclePending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [lastHistoryRefreshKey, setLastHistoryRefreshKey] = useState<string | null>(null);
  const [realBuyError, setRealBuyError] = useState<string | null>(null);
  const [syncingTimedOut, setSyncingTimedOut] = useState(false);
  const [reloadStatePending, setReloadStatePending] = useState(false);
  const realBuyAttemptRef = useRef<string | null>(null);
  const balanceStopAttemptRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const { account, robotState } = useLiveTradingData();
  const refetchRobotState = robotState.refetch;
  const displayRobotState = useRobotDisplayState(robotState.data);
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
  const connectionPending = loginFlow.isPending;
  const accountDisconnected =
    !cachedGrace &&
    !connectionPending &&
    (account.data?.connected === false ||
      account.data?.status === "disconnected" ||
      account.data?.status === "DISCONNECTED");
  const connected =
    connectionPending || (!accountDisconnected && (account.data?.connected === true || cachedGrace));
  const activeMode = "REAL";
  const cycleResetRequired = shouldShowResetCycle(displayRobotState);
  const realSelected = activeMode === "REAL";
  const realBalance = account.data?.balance ?? null;
  const robotInsufficientBalance = displayRobotState?.status === "INSUFFICIENT_BALANCE";
  const realAccountWithoutBalance = realSelected && realBalance != null && realBalance <= 0;
  const depositRequired = Boolean(robotInsufficientBalance || realAccountWithoutBalance);
  const robotStopped =
    cycleResetRequired ||
    depositRequired ||
    displayRobotState?.status === "STOPPED" ||
    (displayRobotState?.enabled === false && displayRobotState?.worker_running === false);
  const robotEnabled = Boolean(displayRobotState) && !robotStopped;
  const settingsLocked = robotEnabled;
  const hasBackend = !!apiConfig.BASE_URL;
  const showResetCycle = cycleResetRequired;
  const disconnectedPresentation = {
    title: "Conta BullEx desconectada",
    detail: "Reconecte sua conta para voltar a operar.",
    footer: null,
  };
  const robotStatusTitle = accountDisconnected
    ? disconnectedPresentation.title
    : depositRequired
      ? "Saldo insuficiente"
      : realBuyError
        ? "Compra REAL bloqueada"
        : robotPresentation.title;
  const robotStatusDetail = accountDisconnected
    ? disconnectedPresentation.detail
    : depositRequired
      ? INSUFFICIENT_BALANCE_MESSAGE
      : realBuyError
        ? `Compra REAL bloqueada: ${realBuyError}`
        : robotPresentation.detail;
  const robotStatusFooter = accountDisconnected || depositRequired ? null : robotPresentation.footer;

  function buildRobotConfigPayload(
    overrides: Partial<Parameters<typeof robotConfig>[0]> = {},
  ): Parameters<typeof robotConfig>[0] {
    return {
      enabled: displayRobotState?.enabled ?? false,
      account_mode: "REAL",
      allow_real: true,
      confirm_real: true,
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

  useEffect(() => {
    if (!syncing) {
      setSyncingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setSyncingTimedOut(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [syncing]);

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

    const realOrder = getRealBuyPayload(displayRobotState);
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
  }, [activeMode, displayRobotState, hasBackend, refetchRobotState]);

  useEffect(() => {
    if (!hasBackend || !displayRobotState || !depositRequired) {
      balanceStopAttemptRef.current = null;
      return;
    }

    const stillRunning = displayRobotState.enabled || displayRobotState.worker_running;
    if (!stillRunning) {
      balanceStopAttemptRef.current = null;
      return;
    }

    const stopKey = [
      displayRobotState.status,
      displayRobotState.cycle_id ?? "-",
      realBalance ?? "null",
    ].join("|");
    if (balanceStopAttemptRef.current === stopKey) return;
    balanceStopAttemptRef.current = stopKey;

    void (async () => {
      try {
        unwrapApiResult(await robotConfig({ enabled: false }));
        unwrapApiResult(await robotStop());
        await robotState.refetch();
      } catch (error) {
        console.warn("[ROBOT_AUTO_STOP_INSUFFICIENT_BALANCE_ERROR]", error);
      }
    })();
  }, [depositRequired, displayRobotState, hasBackend, realBalance, robotState]);

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
              account_mode: "REAL",
              allow_real: true,
              confirm_real: true,
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
    if (settingsLocked) {
      const message = "Pare o robô para alterar configurações.";
      setSettingsActionError(message);
      toast.error(message);
      return;
    }
    setSettingsActionError(null);
    setSettingsActionPending(true);
    try {
      await saveSettings(settings, {
        enabled: displayRobotState?.enabled ?? false,
        cycleMinutes: displayRobotState?.cycle_minutes ?? FIXED_CYCLE_MINUTES,
        accountMode: "REAL",
        allowReal: true,
        confirmReal: true,
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

      {connectionPending ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 text-sm">
          <p className="font-medium text-warning-foreground">
            {loginFlow.phase === "reconnecting"
              ? "Reconectando automaticamente..."
              : "Conectando a BullEx..."}
          </p>
          <p className="mt-1 text-muted-foreground">
            O backend ainda esta trabalhando. O robo sera liberado assim que a conexao terminar.
          </p>
        </div>
      ) : null}

      {!syncing && !connectionPending && accountDisconnected ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-5 text-sm">
          <p className="font-medium text-warning-foreground">Conta BullEx desconectada</p>
          <p className="mt-1 text-muted-foreground">
            Faça login na página BullEx antes de iniciar o robô.
          </p>
          <Link
            to="/bullex"
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Conectar BullEx
          </Link>
        </div>
      ) : null}

      {syncingTimedOut ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="font-medium text-warning-foreground">
            Sincronizando ha mais de 30 segundos.
          </p>
          <p className="mt-1 text-muted-foreground">
            A pagina continua disponivel. Recarregue o estado do robo se a sincronizacao nao sair.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (reloadStatePending) return;
              setSyncingTimedOut(false);
              setReloadStatePending(true);
              try {
                await robotState.refetch({ cancelRefetch: true });
              } finally {
                setReloadStatePending(false);
              }
            }}
            disabled={reloadStatePending}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reloadStatePending ? "Recarregando..." : "Recarregar estado"}
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Tipo de conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O robô opera somente em conta REAL.
            </p>
          </div>
          <div className="w-full sm:w-80">
            <div className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">
              REAL
            </div>
          </div>
        </div>

          {settingsLocked ? (
            <p className="mt-3 text-sm font-medium text-warning-foreground">
              Pare o robô para alterar configurações.
            </p>
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
            {robotStatusFooter ? (
              <p className="mt-1 text-sm font-medium">{robotStatusFooter}</p>
            ) : null}
          </div>
          <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium">
            {robotEnabled ? "Robô ativo" : "Robô parado"}
          </span>
        </div>

        {!accountDisconnected && robotPresentation.trade ? (
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

        {!accountDisconnected && robotPresentation.gale ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Pill label="Mesmo ativo" value={robotPresentation.gale.active} />
            <Pill label="Mesma direção" value={robotPresentation.gale.direction} />
            {robotPresentation.gale.amount != null ? (
              <Pill label="Valor" value={`$${formatAmount(robotPresentation.gale.amount)}`} />
            ) : null}
          </div>
        ) : null}

        {!accountDisconnected && robotPresentation.signal ? (
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
              disabled={settingsLocked}
              onChange={(value) =>
                setSettings({ ...settings, stopWin: normalizeConfigNumber(value, settings.stopWin) })
              }
            />
            <ConfigField
              label="Stop Loss"
              value={settings.stopLoss}
              disabled={settingsLocked}
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
              min={ENTRY_VALUE_MIN}
              max={ENTRY_VALUE_MAX}
              step={ENTRY_VALUE_STEP}
              helperText={`Valor minimo: ${formatCurrencyBRL(ENTRY_VALUE_MIN)}\nValor maximo: ${formatCurrencyBRL(ENTRY_VALUE_MAX)}`}
              disabled={settingsLocked}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  entryValue: normalizeEntryValue(value, settings.entryValue),
                })
              }
            />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 text-sm font-medium">
              <span>Gale ativado</span>
              <input
                type="checkbox"
                checked={settings.martingaleEnabled}
                disabled={settingsLocked}
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
              disabled={settingsLocked}
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
              disabled={settingsLocked}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  martingaleMultiplier: normalizeConfigNumber(value, settings.martingaleMultiplier),
                })
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {settingsLocked ? (
              <p className="w-full text-sm font-medium text-warning-foreground">
                Pare o robô para alterar configurações.
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleSaveAiSettings}
              disabled={!hasBackend || settingsActionPending || settingsLocked}
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
  step = 1,
  min = 0,
  max,
  helperText,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: number | string;
  min?: number;
  max?: number;
  helperText?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block rounded-xl border border-border bg-background/40 px-4 py-3">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {helperText ? (
        <span className="mt-2 block whitespace-pre-line text-xs text-muted-foreground">
          {helperText}
        </span>
      ) : null}
    </label>
  );
}

function normalizeConfigNumber(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
}

function normalizeEntryValue(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(ENTRY_VALUE_MAX, Math.max(ENTRY_VALUE_MIN, Math.round(next)));
}

function normalizeConfigInteger(value: string, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(1, Math.round(next));
}

function getRealBuyPayload(robotState: RobotState): BullexBuyRealPayload | null {
  if (!shouldSendRealBuy(robotState)) return null;

  const isGale = robotState.status === "SENDING_GALE_ORDER" || robotState.gale_in_progress;
  const assetId = isGale
    ? robotState.gale_active ?? robotState.last_trade?.active
    : robotState.pending_signal?.symbol;
  const direction = isGale
    ? robotState.gale_direction ?? robotState.last_trade?.direction
    : robotState.pending_signal?.direction;
  const amount = isGale
    ? robotState.gale_amount ?? robotState.last_trade?.amount ?? robotState.entry_value
    : robotState.entry_value;
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

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function shouldShowResetCycle(robotState: RobotState | undefined) {
  if (!robotState) return false;
  return (
    robotState.status === "STOP_WIN_HIT" ||
    robotState.status === "STOP_LOSS_HIT" ||
    getStopLimit(robotState) != null ||
    [robotState.last_rejection_reason, robotState.rejection_reason].some(
      (reason) => reason === "STOP_WIN_HIT" || reason === "STOP_LOSS_HIT",
    )
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
