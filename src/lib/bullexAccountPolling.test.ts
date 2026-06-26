import test from "node:test";
import assert from "node:assert/strict";
import {
  bullExAccountPollingConfig,
  createOptimisticConnectedBullExAccount,
  getBullExAccountBackoffRemaining,
  getBullExAccountRefetchInterval,
  markBullExAccountConnectBurst,
  registerBullExAccountFetchFailure,
  resetBullExAccountPolling,
  shouldTreatAccountStatusAsDisconnected,
} from "./bullexAccountPolling.ts";

const USER_ID = "user-1";
const BASE_NOW = 1_700_000_000_000;

test("refresh normal nao passa de uma request a cada 15 segundos", () => {
  resetBullExAccountPolling(USER_ID);

  assert.equal(getBullExAccountRefetchInterval(USER_ID, BASE_NOW), 10000);
  assert.equal(
    getBullExAccountRefetchInterval(USER_ID, BASE_NOW + 1000),
    bullExAccountPollingConfig.normalMs,
  );
});

test("connect respeita polling minimo de 10 segundos por ate 20 segundos", () => {
  resetBullExAccountPolling(USER_ID);
  markBullExAccountConnectBurst(USER_ID, BASE_NOW);

  assert.equal(
    getBullExAccountRefetchInterval(USER_ID, BASE_NOW + 1000),
    bullExAccountPollingConfig.connectMs,
  );
  assert.equal(
    getBullExAccountRefetchInterval(
      USER_ID,
      BASE_NOW + bullExAccountPollingConfig.connectWindowMs + 1,
    ),
    bullExAccountPollingConfig.normalMs,
  );
});

test("404 aplica backoff e nao mantem retry agressivo", () => {
  resetBullExAccountPolling(USER_ID);
  markBullExAccountConnectBurst(USER_ID, BASE_NOW);

  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW), 5000);
  assert.equal(getBullExAccountBackoffRemaining(USER_ID, BASE_NOW), 5000);
  assert.equal(getBullExAccountRefetchInterval(USER_ID, BASE_NOW), 5000);
  assert.equal(getBullExAccountRefetchInterval(USER_ID, BASE_NOW + 5001), 10000);
});

test("falhas repetidas sobem o backoff ate 30 segundos", () => {
  resetBullExAccountPolling(USER_ID);

  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW), 5000);
  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW + 5000), 10000);
  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW + 15000), 20000);
  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW + 35000), 30000);
  assert.equal(registerBullExAccountFetchFailure(USER_ID, BASE_NOW + 65000), 30000);
});

test("404 e codigos de sessao sao tratados como disconnected", () => {
  assert.equal(shouldTreatAccountStatusAsDisconnected(404, undefined, 1), false);
  assert.equal(shouldTreatAccountStatusAsDisconnected(404, undefined, 3), true);
  assert.equal(shouldTreatAccountStatusAsDisconnected(undefined, "SESSION_NOT_FOUND", 3), true);
  assert.equal(shouldTreatAccountStatusAsDisconnected(undefined, "SESSION_DISCONNECTED", 3), true);
  assert.equal(shouldTreatAccountStatusAsDisconnected(502, undefined), false);
});

test("connect ok atualiza estado para online imediatamente", () => {
  const optimistic = createOptimisticConnectedBullExAccount("demo@bullex.com", {
    connected: false,
    balance: 120.5,
    currency: "USD",
    mode: "PRACTICE",
    email: null,
    requires_2fa: false,
    status: "disconnected",
  });

  assert.equal(optimistic.connected, true);
  assert.equal(optimistic.status, "connected");
  assert.equal(optimistic.email, "demo@bullex.com");
  assert.equal(optimistic.balance, 120.5);
});
