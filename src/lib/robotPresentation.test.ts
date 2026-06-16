import test from "node:test";
import assert from "node:assert/strict";
import { getRobotPresentation, resetRobotPresentationState } from "./robotPresentation.ts";
import type { RobotState } from "../hooks/useRobotState.ts";
import { getRobotStateRefetchInterval } from "./robotPolling.ts";

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

  assert.equal(presentation.title, "Ativo indisponivel, tentando proximo melhor ativo...");
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

    assert.equal(presentation.title, "Ativo indisponivel, tentando proximo melhor ativo...");
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

test("RESULT_RECEIVED mostra WIN imediatamente e volta ao ciclo apos 5 segundos", () => {
  resetRobotPresentationState();
  const state = createRobotState({
    status: "RESULT_RECEIVED",
    last_trade: createTrade({ result: "WIN", order_id: "order-123" }),
  });

  const received = getRobotPresentation(state, now);
  const nextCycleState = {
    ...state,
    status: "WAITING_NEXT_CYCLE",
    seconds_until_next_cycle: 42,
  };
  const beforeTimeout = getRobotPresentation(nextCycleState, now + 4999);
  const afterTimeout = getRobotPresentation(nextCycleState, now + 5000);

  assert.equal(received.title, "WIN");
  assert.equal(received.kind, "result");
  assert.equal(beforeTimeout.title, "WIN");
  assert.equal(afterTimeout.title, "Analisando mercado...");
  assert.equal(afterTimeout.footer, "Entrada em 00:42");
});

test("polling acelera enquanto aguarda resultado", () => {
  assert.equal(
    getRobotStateRefetchInterval(createRobotState({ operation_in_progress: true })),
    1000,
  );
  assert.equal(getRobotStateRefetchInterval(createRobotState({ result_waiting: true })), 1000);
  assert.equal(getRobotStateRefetchInterval(createRobotState({ status: "PENDING_RESULT" })), 1000);
  assert.equal(getRobotStateRefetchInterval(createRobotState()), 2000);
});

test("WAITING_NEXT_CANDLE_ENTRY mostra sinal preparado e countdown da proxima vela", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      status: "WAITING_NEXT_CANDLE_ENTRY",
      seconds_until_entry: 17,
      pending_signal: createSignal(),
    }),
    now,
  );

  assert.equal(presentation.title, "Sinal preparado");
  assert.equal(presentation.footer, "Entrada no inicio da proxima vela em 00:17");
  assert.equal(presentation.signal?.symbol, "EURUSD-OTC");
});

test("WAITING_NEXT_CANDLE_ENTRY nao mostra 00:00 enquanto aguarda a vela", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      status: "WAITING_NEXT_CANDLE_ENTRY",
      seconds_until_entry: 0,
      pending_signal: createSignal(),
    }),
    now,
  );

  assert.equal(presentation.title, "Sinal preparado");
  assert.equal(presentation.footer, "Aguardando abertura da vela...");
});

test("WAITING_NEXT_CYCLE nao mostra entrada liberada antes de SENDING_ORDER", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      status: "WAITING_NEXT_CYCLE",
      display_countdown_seconds: 0,
      seconds_until_next_cycle: 0,
    }),
    now,
  );

  assert.equal(presentation.title, "Analisando mercado...");
  assert.equal(presentation.footer, null);
});

test("SENDING_ORDER e PENDING_RESULT usam os novos textos de operacao", () => {
  const sending = getRobotPresentation(createRobotState({ status: "SENDING_ORDER" }), now);
  const pending = getRobotPresentation(
    createRobotState({
      status: "PENDING_RESULT",
      expiration_seconds: 29,
      last_trade: createTrade(),
    }),
    now,
  );

  assert.equal(sending.title, "Entrada liberada");
  assert.equal(sending.detail, "Enviando ordem...");
  assert.equal(pending.title, "Aguardando resultado");
  assert.equal(pending.footer, "Expira em 00:29");
});

function createSignal() {
  return {
    symbol: "EURUSD-OTC",
    direction: "CALL" as const,
    confidence: 92,
    strategy_score: 88,
    strategy_name: "Trend",
    used_strategies: ["Trend"],
    strategy_reason: "Confluencia de tendencia",
    payout: 84,
    reason: "Rompimento com confirmacao",
    created_at: "2026-06-14T12:00:00Z",
  };
}

function createTrade(overrides: Partial<NonNullable<RobotState["last_trade"]>> = {}) {
  return {
    active: "EURUSD",
    direction: "CALL" as const,
    amount: 10,
    order_id: "order-1",
    confidence: 90,
    payout: 80,
    result: "PENDING_RESULT",
    expires_at: null,
    sent_at: null,
    finished_at: null,
    profit: null,
    ...overrides,
  };
}

function createRobotState(overrides: Partial<RobotState> = {}): RobotState {
  return {
    enabled: true,
    connected: true,
    status: "WAITING_NEXT_CYCLE",
    cycle_id: null,
    allow_real: false,
    confirm_real: false,
    account_mode: "DEMO",
    active_mode: null,
    connection_status_source: null,
    real_ready: false,
    real_block_reason: null,
    stop_reason: null,
    next_cycle_at: null,
    server_time: null,
    cycle_minutes: 5,
    entry_value: null,
    stop_win: null,
    stop_loss: null,
    seconds_until_entry: 0,
    seconds_until_analysis_window: 0,
    seconds_until_next_cycle: 0,
    seconds_until_entry_window: 0,
    display_countdown_label: null,
    display_countdown_seconds: null,
    expiration_seconds: 0,
    expires_at: null,
    entry_window_open: false,
    operation_in_progress: false,
    result_waiting: false,
    pending_signal: null,
    best_candidate: null,
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
