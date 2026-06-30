import test from "node:test";
import assert from "node:assert/strict";
import { getRobotAiReview } from "./robotAi.ts";
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
    result_display_until: "2026-06-14T12:00:05Z",
    last_trade: createTrade({ result: "WIN", order_id: "order-123" }),
  });

  const received = getRobotPresentation(state, now);
  const nextCycleState = {
    ...state,
    status: "WAITING_NEXT_CYCLE",
    result_display_until: "2026-06-14T12:00:05Z",
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

test("WAITING_GALE_ENTRY mostra Gale preparado sem tratar loss inicial como final", () => {
  resetRobotPresentationState();

  const presentation = getRobotPresentation(
    createRobotState({
      status: "WAITING_GALE_ENTRY",
      cycle_id: "cycle-1",
      gale_step: 1,
      gale_active: "EURUSD",
      gale_direction: "CALL",
      gale_amount: 20,
      last_trade: createTrade({ result: "LOSS", order_id: "order-initial" }),
    }),
    now,
  );

  assert.equal(presentation.title, "Gale preparado");
  assert.equal(presentation.kind, "gale");
  assert.equal(presentation.gale?.active, "EURUSD");
  assert.equal(presentation.gale?.direction, "CALL");
  assert.equal(presentation.gale?.amount, 20);
  assert.equal(presentation.result, null);
});

test("status de envio e resultado pendente do Gale mostram textos especificos", () => {
  resetRobotPresentationState();

  const sending = getRobotPresentation(
    createRobotState({
      status: "SENDING_GALE_ORDER",
      gale_active: "EURUSD",
      gale_direction: "PUT",
    }),
    now,
  );
  const pending = getRobotPresentation(
    createRobotState({
      status: "PENDING_GALE_RESULT",
      gale_active: "EURUSD",
      gale_direction: "PUT",
    }),
    now,
  );

  assert.equal(sending.title, "Gale em andamento");
  assert.equal(pending.title, "Aguardando resultado do Gale 1");
});

test("cycle_result final de Gale mostra WIN ou LOSS na tela", () => {
  resetRobotPresentationState();

  const galeWin = getRobotPresentation(
    createRobotState({
      status: "GALE_RESULT_RECEIVED",
      cycle_id: "cycle-win",
      cycle_result: "GALE_WIN",
      gale_step: 1,
      last_trade: createTrade({ result: "WIN", order_id: "order-gale-win" }),
    }),
    now,
  );

  resetRobotPresentationState();

  const galeLoss = getRobotPresentation(
    createRobotState({
      status: "GALE_RESULT_RECEIVED",
      cycle_id: "cycle-loss",
      cycle_result: "GALE_LOSS",
      gale_step: 1,
      last_trade: createTrade({ result: "LOSS", order_id: "order-gale-loss" }),
    }),
    now,
  );

  assert.equal(galeWin.title, "WIN");
  assert.equal(galeLoss.title, "LOSS");
  resetRobotPresentationState();
});

test("polling acelera enquanto aguarda resultado", () => {
  assert.equal(
    getRobotStateRefetchInterval(createRobotState({ operation_in_progress: true })),
    1000,
  );
  assert.equal(getRobotStateRefetchInterval(createRobotState({ result_waiting: true })), 1000);
  assert.equal(getRobotStateRefetchInterval(createRobotState({ status: "PENDING_RESULT" })), 1000);
  assert.equal(getRobotStateRefetchInterval(createRobotState()), 1000);
  assert.equal(getRobotStateRefetchInterval(createRobotState({ enabled: false })), 5000);
});

test("result_waiting prioriza aguardando resultado mesmo fora de pending_result", () => {
  const pending = getRobotPresentation(
    createRobotState({
      status: "ANALYZING",
      result_waiting: true,
      pending_signal: createSignal(),
    }),
    now,
  );

  assert.equal(pending.title, "Operacao aberta");
  assert.equal(pending.detail, "Aguardando resultado");
});

test("STOP_WIN_HIT e STOP_LOSS_HIT mostram robo pausado", () => {
  const stopWin = getRobotPresentation(createRobotState({ status: "STOP_WIN_HIT" }), now);
  const stopLoss = getRobotPresentation(createRobotState({ status: "STOP_LOSS_HIT" }), now);

  assert.equal(stopWin.title, "Stop Win atingido");
  assert.equal(stopWin.detail, "Robo pausado");
  assert.equal(stopWin.kind, "stopped");
  assert.equal(stopLoss.title, "Stop Loss atingido");
  assert.equal(stopLoss.detail, "Robo pausado");
  assert.equal(stopLoss.kind, "stopped");
});

test("WAITING_ENTRY mostra sinal preparado com entrada em MM", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      status: "WAITING_ENTRY",
      seconds_until_entry: 17,
      pending_signal: createSignal(),
    }),
    now,
  );

  assert.equal(presentation.title, "Melhor ativo encontrado");
  assert.equal(presentation.detail, null);
  assert.equal(presentation.footer, "Entrada em 00:17");
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

  assert.equal(presentation.title, "Melhor ativo encontrado");
  assert.equal(presentation.detail, null);
  assert.equal(presentation.footer, "Entrada em 00:17");
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

  assert.equal(presentation.title, "Melhor ativo encontrado");
  assert.equal(presentation.detail, null);
  assert.equal(presentation.footer, "Aguardando abertura da vela...");
});

test("SIGNAL_EXPIRED mostra motivo real da perda do sinal", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      status: "SIGNAL_EXPIRED",
      pending_signal: createSignal(),
      seconds_until_entry: 0,
    }),
    now,
  );

  assert.equal(presentation.title, "Entrada perdida por atraso. Aguardando novo sinal.");
  assert.equal(presentation.detail, null);
});

test("enabled false sem worker parado ainda nao mostra robo parado", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      enabled: false,
      worker_running: true,
      status: "WAITING_NEXT_CYCLE",
    }),
    now,
  );

  assert.notEqual(presentation.title, "Robo parado");
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

test("status DISCONNECTED nunca mostra analise operacional", () => {
  const presentation = getRobotPresentation(
    createRobotState({
      connected: false,
      disconnected: true,
      status: "DISCONNECTED",
      best_candidate: createSignal(),
      seconds_until_next_cycle: 42,
    }),
    now,
  );

  assert.equal(presentation.title, "Conta BullEx desconectada");
  assert.equal(presentation.detail, "Reconecte para o robo operar");
  assert.equal(presentation.footer, null);
  assert.equal(presentation.signal, null);
});

test("BUYING e WAITING_RESULT usam os novos textos de operacao", () => {
  const sending = getRobotPresentation(createRobotState({ status: "BUYING" }), now);
  const pending = getRobotPresentation(
    createRobotState({
      status: "WAITING_RESULT",
      operation_in_progress: true,
      result_waiting: true,
      expiration_seconds: 29,
      last_trade: createTrade(),
    }),
    now,
  );

  assert.equal(sending.title, "Executando ordem");
  assert.equal(sending.detail, "Enviando ordem...");
  assert.equal(pending.title, "Operacao aberta");
  assert.equal(pending.detail, "Aguardando resultado");
  assert.equal(pending.footer, "Resultado em 00:29");
});

test("analise da IA mostra bloqueio e fallback local quando necessario", () => {
  const blocked = getRobotAiReview(
    createSignal({
      ai_approved: false,
      ai_block_reason: "mercado_lateral",
    }),
  );
  const fallback = getRobotAiReview(
    createSignal({
      ai_error: "timeout",
    }),
  );

  assert.equal(blocked?.statusLabel, "Reprovado");
  assert.equal(blocked?.blockMessage, "IA bloqueou entrada: mercado lateral");
  assert.equal(fallback?.statusLabel, "Indisponivel");
  assert.equal(fallback?.fallbackMessage, "IA indisponivel, usando analise tecnica local.");
});

function createSignal(overrides: Partial<NonNullable<RobotState["pending_signal"]>> = {}) {
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
    ai_approved: null,
    ai_confidence: null,
    ai_risk: null,
    ai_candle_reading: null,
    ai_entry_reason: null,
    ai_voice_text: null,
    ai_block_reason: null,
    ai_error: null,
    ...overrides,
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
    strategy_score: 88,
    strategy_name: "Trend",
    used_strategies: ["Trend"],
    strategy_reason: "Confluencia de tendencia",
    entry_reason: "Rompimento com confirmacao",
    result: "PENDING_RESULT",
    expires_at: null,
    sent_at: null,
    finished_at: null,
    profit: null,
    gale_step: null,
    is_gale: false,
    account_mode: "REAL" as const,
    ...overrides,
  };
}

function createRobotState(overrides: Partial<RobotState> = {}): RobotState {
  return {
    enabled: true,
    worker_running: true,
    connected: true,
    status: "WAITING_NEXT_CYCLE",
    cycle_id: null,
    allow_real: true,
    confirm_real: true,
    account_mode: "REAL",
    active_mode: "REAL",
    connection_status_source: null,
    real_ready: true,
    real_block_reason: null,
    stop_reason: null,
    next_cycle_at: null,
    server_time: null,
    cycle_minutes: 5,
    entry_value: null,
    stop_win: null,
    stop_loss: null,
    ai_analysis_enabled: false,
    ai_confirmation_required: false,
    ai_min_confidence: null,
    seconds_until_entry: 0,
    martingale_enabled: false,
    martingale_multiplier: 2,
    martingale_steps: 1,
    cycle_result: null,
    gale_step: null,
    gale_pending: false,
    gale_in_progress: false,
    gale_active: null,
    gale_direction: null,
    gale_amount: null,
    seconds_until_analysis_window: 0,
    seconds_until_next_cycle: 0,
    seconds_until_entry_window: 0,
    display_countdown_label: null,
    display_countdown_seconds: null,
    expiration_seconds: 0,
    expires_at: null,
    entry_window_open: false,
    entry_target: null,
    operation_in_progress: false,
    result_waiting: false,
    operation_message: null,
    result_display_until: null,
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
