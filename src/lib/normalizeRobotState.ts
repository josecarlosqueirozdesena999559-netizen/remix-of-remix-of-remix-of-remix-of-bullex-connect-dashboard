import type { RobotDirection, RobotSignal, RobotState, RobotTrade } from "@/hooks/useRobotState";

export function normalizeRobotState(input: unknown): RobotState {
  const value = unwrapRobotState(input);
  return {
    enabled: normalizeBoolean(value.enabled),
    status: normalizeText(value.status, "STOPPED").toUpperCase(),
    allow_real: normalizeBoolean(value.allow_real ?? value.allowReal),
    confirm_real: normalizeBoolean(value.confirm_real ?? value.confirmReal),
    account_mode: normalizeAccountMode(value.account_mode ?? value.accountMode),
    active_mode: normalizeOptionalText(value.active_mode ?? value.activeMode),
    real_ready: normalizeBoolean(value.real_ready ?? value.realReady),
    real_block_reason: normalizeOptionalText(value.real_block_reason ?? value.realBlockReason),
    next_cycle_at: normalizeOptionalText(value.next_cycle_at ?? value.nextCycleAt),
    seconds_until_next_cycle: Math.max(
      0,
      normalizeNumber(value.seconds_until_next_cycle ?? value.secondsUntilNextCycle) ?? 0,
    ),
    operation_in_progress: normalizeBoolean(
      value.operation_in_progress ?? value.operationInProgress,
    ),
    last_signal: normalizeSignal(value.last_signal ?? value.lastSignal),
    last_trade: normalizeTrade(value.last_trade ?? value.lastTrade),
    wins: Math.max(0, normalizeNumber(value.wins) ?? 0),
    losses: Math.max(0, normalizeNumber(value.losses) ?? 0),
    profit: normalizeNumber(value.profit) ?? 0,
    rejection_reason: normalizeOptionalText(value.rejection_reason ?? value.rejectionReason),
    disconnected: false,
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
    confidence: normalizePercentage(value.confidence ?? value.score ?? value.probability),
    payout: normalizePercentage(value.payout),
  };
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
    sent_at: normalizeOptionalText(value.sent_at ?? value.sentAt),
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

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function unwrapRobotState(input: unknown): Record<string, unknown> {
  let value = asRecord(input);

  for (let depth = 0; depth < 3; depth += 1) {
    if ("enabled" in value || "status" in value || "operation_in_progress" in value) {
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
