import { useEffect, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { RobotOverlay } from "@/components/RobotOverlay";
import type { BullExAccountState } from "@/hooks/useBullExAccount";
import { useLiveTradingData } from "@/hooks/useLiveTradingData";
import { useRobotDisplayState } from "@/hooks/useRobotDisplayState";
import { useRobotNarrator } from "@/hooks/useRobotNarrator";
import { useRobotSettings } from "@/hooks/useRobotSettings";
import type { RobotState } from "@/hooks/useRobotState";
import { useSmoothCountdown } from "@/hooks/useSmoothCountdown";
import { useAuth } from "@/lib/useAuth";
import { isAdminUser } from "@/lib/adminAccess";

export function FloatingRobot({ userId }: { userId?: string }) {
  const [visible, setVisible] = useState(true);
  const [adminWins, setAdminWins] = useState(0);
  const [adminResultFlash, setAdminResultFlash] = useState<null | { at: number; wins: number }>(null);
  const { account, robotState } = useLiveTradingData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const displayRobotState = useRobotDisplayState(robotState.data);
  const { settings, saveSettings } = useRobotSettings(userId);
  const isAdminModel = isAdminUser(user) && pathname === "/admin";
  const nextCycleSeconds = useSmoothCountdown(
    displayRobotState?.display_countdown_seconds ?? displayRobotState?.seconds_until_next_cycle,
    getNextCycleResetKey(displayRobotState),
    Boolean(
      displayRobotState?.enabled &&
        ((displayRobotState.display_countdown_seconds ?? displayRobotState.seconds_until_next_cycle) >
          0),
    ),
    displayRobotState?.fetched_at,
  );
  const adminModelState = useMemo(
    () => buildAdminModelRobotState(adminWins, adminResultFlash),
    [adminResultFlash, adminWins],
  );
  const effectiveRobotState = isAdminModel ? adminModelState : displayRobotState;
  const effectiveAccount = isAdminModel ? getAdminModelAccount() : account.data;
  const effectiveNextCycleSeconds = isAdminModel ? 42 : nextCycleSeconds;
  const narrator = useRobotNarrator(
    effectiveRobotState,
    settings.narratorEnabled && !isAdminModel,
    effectiveNextCycleSeconds,
  );

  useEffect(() => {
    if (!adminResultFlash) return;
    const timer = window.setTimeout(() => setAdminResultFlash(null), 2200);
    return () => window.clearTimeout(timer);
  }, [adminResultFlash]);

  function setOverlayVisible(nextVisible: boolean) {
    setVisible(nextVisible);
  }

  function handleAdminAddWin() {
    setAdminWins((current) => {
      const nextWins = current + 1;
      setAdminResultFlash({ at: Date.now(), wins: nextWins });
      return nextWins;
    });
  }

  function handleAdminResetScore() {
    setAdminWins(0);
    setAdminResultFlash(null);
  }

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setOverlayVisible(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent"
      >
        <Bot className="h-4 w-4 text-primary" />
        Mostrar robo
      </button>
    );
  }

  return (
    <RobotOverlay
      robotState={effectiveRobotState}
      account={effectiveAccount}
      narratorEnabled={settings.narratorEnabled}
      narratorSpeaking={narrator.speaking}
      onSilenceNarrator={narrator.silence}
      settings={settings}
      onSettingsChange={(nextSettings) =>
        saveSettings(nextSettings, {
          enabled: effectiveRobotState?.enabled ?? false,
          cycleMinutes: effectiveRobotState?.cycle_minutes ?? 5,
          accountMode:
            effectiveRobotState?.account_mode ??
            (effectiveAccount?.mode === "REAL" ? "REAL" : "DEMO"),
          allowReal: effectiveRobotState?.allow_real ?? effectiveAccount?.mode === "REAL",
          confirmReal: effectiveRobotState?.confirm_real ?? effectiveAccount?.mode === "REAL",
        })
      }
      onClose={() => setOverlayVisible(false)}
      showConfig
      adminModelControls={
        isAdminModel
          ? {
              onAddWin: handleAdminAddWin,
              onResetScore: handleAdminResetScore,
            }
          : null
      }
    />
  );
}

function buildAdminModelRobotState(
  wins: number,
  resultFlash: { at: number; wins: number } | null,
): RobotState {
  const now = Date.now();
  const showWin = resultFlash != null && now - resultFlash.at < 2200;
  const baseTrade = showWin
    ? {
        active: "EURUSD",
        direction: "CALL" as const,
        amount: 10,
        order_id: `admin-model-${resultFlash.wins}`,
        confidence: 92,
        payout: 84,
        result: "WIN",
        expires_at: new Date(now + 60_000).toISOString(),
        sent_at: new Date(now - 10_000).toISOString(),
        finished_at: new Date(now).toISOString(),
        profit: 8.4,
        gale_step: null,
        is_gale: false,
        account_mode: "DEMO" as const,
      }
    : null;

  return {
    enabled: true,
    worker_running: true,
    connected: true,
    status: showWin ? "RESULT_RECEIVED" : "WAITING_ANALYSIS_WINDOW",
    cycle_id: "admin-model-cycle",
    allow_real: false,
    confirm_real: false,
    account_mode: "DEMO",
    active_mode: "PRACTICE",
    connection_status_source: null,
    real_ready: false,
    real_block_reason: null,
    stop_reason: null,
    next_cycle_at: new Date(now + 42_000).toISOString(),
    server_time: new Date(now).toISOString(),
    cycle_minutes: 5,
    entry_value: 10,
    stop_win: null,
    stop_loss: null,
    ai_analysis_enabled: false,
    ai_confirmation_required: false,
    ai_min_confidence: null,
    seconds_until_entry: 0,
    martingale_enabled: false,
    martingale_multiplier: 2,
    martingale_steps: 1,
    cycle_result: showWin ? "WIN" : null,
    gale_step: null,
    gale_pending: false,
    gale_in_progress: false,
    gale_active: null,
    gale_direction: null,
    gale_amount: null,
    seconds_until_analysis_window: 21,
    seconds_until_next_cycle: 42,
    seconds_until_entry_window: 0,
    display_countdown_label: null,
    display_countdown_seconds: 42,
    expiration_seconds: 0,
    expires_at: null,
    entry_window_open: false,
    operation_in_progress: false,
    result_waiting: false,
    pending_signal: null,
    best_candidate: {
      symbol: "EURUSD-OTC",
      direction: "CALL",
      confidence: 92,
      strategy_score: 88,
      strategy_name: "Trend",
      used_strategies: ["Trend", "RSI"],
      strategy_reason: "Confluencia de tendencia",
      payout: 84,
      reason: "Modelo visual do admin",
      created_at: new Date(now).toISOString(),
      ai_approved: null,
      ai_confidence: null,
      ai_risk: null,
      ai_candle_reading: null,
      ai_entry_reason: null,
      ai_voice_text: null,
      ai_block_reason: null,
      ai_error: null,
    },
    last_signal: null,
    last_trade: baseTrade,
    wins,
    losses: 0,
    profit: wins * 8.4,
    last_order_error: null,
    order_fallback_in_progress: false,
    order_fallback_attempt: 0,
    order_fallback_max_attempts: 3,
    rejection_reason: null,
    last_rejection_reason: null,
    rejected_at: null,
    disconnected: false,
    fetched_at: now,
  };
}

function getAdminModelAccount(): BullExAccountState {
  return {
    connected: true,
    email: "admin@modelo.local",
    mode: "PRACTICE",
    balance: 0,
    currency: "USD",
    status: "connected",
  };
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
