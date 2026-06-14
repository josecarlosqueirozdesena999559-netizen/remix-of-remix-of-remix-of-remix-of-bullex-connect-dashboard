import test from "node:test";
import assert from "node:assert/strict";
import { getRobotPresentation, resetRobotPresentationState } from "./robotPresentation.ts";
import type { RobotState } from "@/hooks/useRobotState";

const now = Date.parse("2026-06-14T12:00:00Z");

test("primeiro ativo indisponivel mostra fallback para tentar o segundo", () => {
  resetRobotPresentationState();

  const presentation = getRobotPresentation(
    createRobotState({
      status: "SENDING_ORDER",
      last_order_error: "ACTIVE_UNAVAILABLE",
      order_fallback_attempt: 1,
    }),
    now,
  );

  assert.equal(presentation.title, "Ativo indisponível, tentando próximo melhor ativo...");
  assert.equal(presentation.kind, "analyzing");
});

test("fallback permanece visivel ate 3 tentativas", () => {
  resetRobotPresentationState();

  for (const attempt of [1, 2, 3]) {
    const presentation = getRobotPresentation(
      createRobotState({
        status: "ORDER_FALLBACK",
        order_fallback_attempt: attempt,
        order_fallback_max_attempts: 3,
      }),
      now,
    );

    assert.equal(presentation.title, "Ativo indisponível, tentando próximo melhor ativo...");
  }
});

test("se todos os ativos falharem mostra ORDER_REJECTED", () => {
  resetRobotPresentationState();

  const presentation = getRobotPresentation(
    createRobotState({
      status: "ORDER_REJECTED",
      last_order_error: "Todos os ativos indisponiveis",
      order_fallback_attempt: 3,
      order_fallback_max_attempts: 3,
    }),
    now,
  );

  assert.equal(presentation.title, "Entrada rejeitada");
  assert.equal(presentation.kind, "rejected");
});

function createRobotState(overrides: Partial<RobotState> = {}): RobotState {
  return {
    enabled: true,
    connected: true,
    status: "WAITING_NEXT_CYCLE",
    allow_real: false,
    confirm_real: false,
    account_mode: "DEMO",
    active_mode: null,
    real_ready: false,
    real_block_reason: null,
    stop_reason: null,
    next_cycle_at: null,
    server_time: null,
    cycle_minutes: 5,
    entry_value: null,
    stop_win: null,
    stop_loss: null,
    seconds_until_analysis_window: 0,
    seconds_until_next_cycle: 0,
    seconds_until_entry_window: 0,
    expiration_seconds: 0,
    expires_at: null,
    entry_window_open: false,
    operation_in_progress: false,
    result_waiting: false,
    pending_signal: null,
    last_signal: null,
    last_trade: null,
    wins: 0,
    losses: 0,
    profit: 0,
    last_order_error: null,
    order_fallback_in_progress: false,
    order_fallback_attempt: 0,
    order_fallback_max_attempts: 3,
    rejection_reason: null,
    last_rejection_reason: null,
    rejected_at: null,
    disconnected: false,
    fetched_at: now,
    ...overrides,
  };
}
