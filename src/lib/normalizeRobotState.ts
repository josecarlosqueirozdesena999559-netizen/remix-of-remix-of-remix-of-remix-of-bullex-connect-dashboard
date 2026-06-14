import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

export function normalizeRobotState(input: unknown): RobotState {
  const value = unwrapRobotState(input);
  const config = asRecord(
    value.config ?? value.robot_config ?? value.robotConfig ?? value.settings,
  );
  const tradeInput =
    value.current_trade ??
    value.currentTrade ??
    value.pending_trade ??
    value.pendingTrade ??
    value.operation ??
    value.last_trade ??
    value.lastTrade;
  const tradeValue = asRecord(tradeInput);
  const status = normalizeText(value.status, "STOPPED").toUpperCase();
  const connected = normalizeConnected(
    value.connected ?? value.account_connected ?? value.accountConnected,
  );
  const disconnected =
    connected === false ||
    status === "ACCOUNT_DISCONNECTED" ||
    normalizeBoolean(value.disconnected ?? value.account_disconnected ?? value.accountDisconnected);
  const nextCycleAt = normalizeOptionalText(value.next_cycle_at ?? value.nextCycleAt);
  const cycleMinutes = Math.max(1, normalizeNumber(value.cycle_minutes ?? value.cycleMinutes) ?? 5);
  const secondsUntilNextCycle = normalizeNumber(
    value.seconds_until_next_cycle ?? value.secondsUntilNextCycle,
  );

  const expiresAt = normalizeOptionalText(
    value.expires_at ??
      value.expiresAt ??
      value.expiration_at ??
      value.expirationAt ??
      tradeValue.expires_at ??
      tradeValue.expiresAt ??
      tradeValue.expiration_at ??
      tradeValue.expirationAt,
  );
  const expirationSeconds =
    normalizeNumber(
      value.expiration_seconds ??
        value.expirationSeconds ??
        value.seconds_until_expiration ??
        value.secondsUntilExpiration ??
        value.expires_in ??
        value.expiresIn ??
        tradeValue.expiration_seconds ??
        tradeValue.expirationSeconds ??
        tradeValue.seconds_until_expiration ??
        tradeValue.secondsUntilExpiration ??
        tradeValue.expires_in ??
        tradeValue.expiresIn,
    ) ?? 0;
  const pendingSignal =
    status === "WAITING_ENTRY_WINDOW"
      ? normalizeSignal(
          value.pending_signal ??
            value.pendingSignal ??
            value.best_candidate ??
            value.bestCandidate,
        )
      : null;

  return {
    enabled: normalizeBoolean(value.enabled),
    connected: !disconnected,
    status,
    allow_real: normalizeBoolean(value.allow_real ?? value.allowReal),
    confirm_real: normalizeBoolean(value.confirm_real ?? value.confirmReal),
    account_mode: normalizeAccountMode(value.account_mode ?? value.accountMode),
    active_mode: normalizeOptionalText(value.active_mode ?? value.activeMode),
    real_ready: normalizeBoolean(value.real_ready ?? value.realReady),
    real_block_reason: normalizeOptionalText(value.real_block_reason ?? value.realBlockReason),
    stop_reason: normalizeOptionalText(
      value.stop_reason ??
        value.stopReason ??
        value.stop_status ??
        value.stopStatus ??
        value.stop_type ??
        value.stopType,
    ),
    next_cycle_at: nextCycleAt,
    cycle_minutes: cycleMinutes,
    entry_value: normalizeNumber(
      value.entry_value ?? value.entryValue ?? config.entry_value ?? config.entryValue,
    ),
    stop_win: normalizeNumber(value.stop_win ?? value.stopWin ?? config.stop_win ?? config.stopWin),
    stop_loss: normalizeNumber(
      value.stop_loss ?? value.stopLoss ?? config.stop_loss ?? config.stopLoss,
    ),
    seconds_until_next_cycle: Math.max(
      0,
      (secondsUntilNextCycle != null && secondsUntilNextCycle > 0 ? secondsUntilNextCycle : null) ??
        getSecondsUntil(nextCycleAt) ??
        (status === "WAITING_NEXT_CYCLE" ? cycleMinutes * 60 : 0),
    ),
    seconds_until_entry_window: Math.max(
      0,
      normalizeNumber(value.seconds_until_entry_window ?? value.secondsUntilEntryWindow) ?? 0,
    ),
    expiration_seconds: Math.max(0, expirationSeconds),
    expires_at: expiresAt,
    entry_window_open: normalizeBoolean(value.entry_window_open ?? value.entryWindowOpen),
    operation_in_progress: normalizeBoolean(
      value.operation_in_progress ?? value.operationInProgress,
    ),
    result_waiting: normalizeBoolean(value.result_waiting ?? value.resultWaiting),
    pending_signal: pendingSignal,
    last_signal: normalizeSignal(value.last_signal ?? value.lastSignal),
    last_trade: normalizeTrade(tradeInput),
    wins: Math.max(0, normalizeNumber(value.wins) ?? 0),
    losses: Math.max(0, normalizeNumber(value.losses) ?? 0),
    profit: normalizeNumber(value.profit) ?? 0,
    last_order_error: normalizeOptionalText(
      value.last_order_error ?? value.lastOrderError ?? value.order_error ?? value.orderError,
    ),
    rejection_reason: normalizeOptionalText(value.rejection_reason ?? value.rejectionReason),
    last_rejection_reason: normalizeOptionalText(
      value.last_rejection_reason ??
        value.lastRejectionReason ??
        value.rejection_reason ??
        value.rejectionReason,
    ),
    rejected_at: normalizeOptionalText(value.rejected_at ?? value.rejectedAt),
    disconnected,
    fetched_at: Date.now(),
  };
}

function normalizeAccountMode(input: unknown): "DEMO" | "REAL" {
  return normalizeText(input).toUpperCase() === "REAL" ? "REAL" : "DEMO";
}

function normalizeSignal(input: unknown): RobotSignal | null {
  const value = asRecord(input);
  const symbol = normalizeText(value.symbol ?? value.active ?? value.asset);
  const direction = normalizeDirection(value.signal ?? value.direction ?? value.type);
  if (!symbol || !direction) return null;

  return {
    symbol,
    direction,
    confidence: normalizePercentage(value.confidence ?? value.probability),
    strategy_score: normalizeNumber(value.strategy_score ?? value.strategyScore ?? value.score),
    strategy_name: normalizeOptionalText(
      value.strategy_name ?? value.strategyName ?? value.strategy,
    ),
    strategy_reason: normalizeReason(
      value.strategy_reason ?? value.strategyReason ?? value.reason ?? value.reasons,
    ),
    payout: normalizePercentage(value.payout),
    reason: normalizeReason(value.reason ?? value.reasons ?? value.motive ?? value.explanation),
    created_at: normalizeOptionalText(value.created_at ?? value.createdAt ?? value.timestamp),
  };
}

function getSecondsUntil(value: string | null) {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const timestamp = Date.parse(hasTimezone ? value : `${value}Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function normalizeTrade(input: unknown): RobotTrade | null {
  const value = asRecord(input);
  const active = normalizeText(value.active ?? value.symbol ?? value.asset);
  const direction = normalizeDirection(value.direction ?? value.signal ?? value.type);
  if (!active || !direction) return null;

  return {
    active,
    direction,
    amount: normalizeNumber(value.amount ?? value.entry_value ?? value.entryValue),
    order_id: normalizeIdentifier(value.order_id ?? value.orderId),
    confidence: normalizePercentage(value.confidence),
    payout: normalizePercentage(value.payout),
    result: normalizeText(value.result, "PENDING_RESULT").toUpperCase(),
    expires_at: normalizeOptionalText(
      value.expires_at ?? value.expiresAt ?? value.expiration_at ?? value.expirationAt,
    ),
    sent_at: normalizeOptionalText(value.sent_at ?? value.sentAt),
    finished_at: normalizeOptionalText(value.finished_at ?? value.finishedAt),
    profit: normalizeNumber(value.profit ?? value.pnl ?? value.result_amount ?? value.resultAmount),
  };
}

function normalizeDirection(input: unknown): RobotDirection | null {
  const direction = normalizeText(input).toUpperCase();
  return direction === "CALL" || direction === "PUT" || direction === "WAIT" ? direction : null;
}

function normalizePercentage(input: unknown) {
  const value = normalizeNumber(input);
  if (value == null) return null;
  return value <= 1 ? value * 100 : value;
}

function normalizeNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const number = Number(input.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function normalizeBoolean(input: unknown) {
  if (input === true || input === 1) return true;
  if (typeof input !== "string") return false;
  return input.trim().toLowerCase() === "true" || input.trim() === "1";
}

function normalizeConnected(input: unknown): boolean | null {
  if (input == null) return null;
  if (input === true || input === 1) return true;
  if (input === false || input === 0) return false;
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "connected") return true;
  if (normalized === "false" || normalized === "0" || normalized === "disconnected") return false;
  return null;
}

function normalizeIdentifier(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return String(input);
  return normalizeOptionalText(input);
}

function normalizeText(input: unknown, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function normalizeOptionalText(input: unknown) {
  const value = normalizeText(input);
  return value || null;
}

function normalizeReason(input: unknown) {
  if (Array.isArray(input)) {
    const lines = input.map((item) => normalizeText(item)).filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  }

  return normalizeOptionalText(input);
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function unwrapRobotState(input: unknown): Record<string, unknown> {
  let value = asRecord(input);

  for (let depth = 0; depth < 3; depth += 1) {
    if (
      "enabled" in value ||
      "status" in value ||
      "operation_in_progress" in value ||
      "result_waiting" in value
    ) {
      return value;
    }

    const nested =
      value.data ?? value.state ?? value.robot_state ?? value.robotState ?? value.robot;
    const nextValue = asRecord(nested);
    if (Object.keys(nextValue).length === 0) break;
    value = nextValue;
  }

  return value;
}
