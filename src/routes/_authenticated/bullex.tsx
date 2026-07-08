import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, LockKeyhole, Mail, Plug, Power, X } from "lucide-react";
import {
  BULLEX_ACCOUNT_QUERY_KEY,
  type BullExAccountState,
} from "@/hooks/useBullExAccount";
import { useLiveTradingData } from "@/hooks/useLiveTradingData";
import { apiConfig } from "@/lib/api";
import { createOptimisticConnectedBullExAccount } from "@/lib/bullexAccountPolling";
import { formatBullExBalance, isBullExConnected } from "@/lib/bullexConnection";
import {
  cancelBullExLogin,
  completeBullExLogin,
  failBullExLogin,
  getBullExLoginStepLabel,
  markBullExLoginVisualTimeout,
  resetBullExLoginState,
  startBullExLogin,
  updateBullExLoginBackendStatus,
  useBullExLoginState,
} from "@/lib/bullexLoginState";
import { useAuth } from "@/lib/useAuth";
import {
  syncAfterBullExConnect,
  useConnectBullex,
  useDisconnectBullex,
  useReconnectBullex,
} from "@/lib/useBullex";

export const Route = createFileRoute("/_authenticated/bullex")({
  head: () => ({ meta: [{ title: "BullEx - BullEx AutoBot" }] }),
  component: BullExPage,
});

const LOGIN_VISUAL_TIMEOUT_MS = 90_000;
const LOGIN_POLL_MS = 2_500;

function BullExPage() {
  const { user } = useAuth();
  const { account, accountStatus, robotState } = useLiveTradingData();
  const disconnect = useDisconnectBullex();
  const reconnect = useReconnectBullex();
  const [loginOpen, setLoginOpen] = useState(false);
  const loginFlow = useBullExLoginState(user?.id);
  const syncing = account.isLoading || accountStatus.isLoading || robotState.isLoading;
  const cachedGrace = robotState.data?.connection_status_source === "cached_grace";
  const connectionPending = loginFlow.isPending;
  const connected = isBullExConnected({
    account: account.data,
    accountStatus: accountStatus.data,
    cachedGrace,
    pendingConnect: connectionPending,
  });
  const statusLabel = getConnectionStatusLabel({
    syncing,
    connected,
    cachedGrace,
    connectionPending,
  });
  const hasBackend = !!apiConfig.BASE_URL;
  const isToggling = disconnect.isPending || reconnect.isPending;

  async function handleDisconnect() {
    if (!hasBackend || syncing || !connected || connectionPending) return;
    await disconnect.mutateAsync();
    await account.refetch();
  }

  async function handleReconnect() {
    if (!hasBackend || syncing || connected) return;
    await reconnect.mutateAsync();
    await account.refetch();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Plug className="h-6 w-6" /> BullEx
          </h1>
          <p className="text-sm text-muted-foreground">
            Conecte sua conta BullEx para o AutoBot operar.
          </p>
        </div>
        <span
          className={`rounded-md px-3 py-1 text-sm font-semibold ${
            connected
              ? cachedGrace || connectionPending
                ? "bg-warning/15 text-warning-foreground"
                : "bg-success/15 text-success"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {statusLabel}
        </span>
      </header>

      {!hasBackend ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          <strong>Backend não configurado.</strong> Defina{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_API_BASE_URL</code>{" "}
          e{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">
            VITE_PANEL_API_KEY
          </code>{" "}
          no ambiente para conectar o painel ao backend BullEx.
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status da conexão
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {connectionPending
                ? "Conectando a BullEx..."
                : syncing
                  ? "Sincronizando..."
                  : connected
                    ? cachedGrace
                      ? "Reconectando conta BullEx"
                      : "Conta BullEx conectada"
                    : "Conta BullEx desconectada"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {connectionPending
                ? loginFlow.phase === "reconnecting"
                  ? "Reconectando automaticamente..."
                  : "O backend continua trabalhando para abrir e reaproveitar sua sessão."
                : syncing
                  ? "Buscando conta BullEx e estado do robô."
                  : connected
                    ? cachedGrace
                      ? "Usando estado recente enquanto a reconexão finaliza."
                      : "Sua conta está pronta para ser usada pelo robô."
                    : "Faça login para deixar a conta conectada."}
            </p>
          </div>
          <span
            className={`h-3 w-3 rounded-full ${
              connectionPending || syncing
                ? "animate-pulse bg-warning"
                : connected
                  ? "animate-pulse bg-success"
                  : "bg-muted-foreground/40"
            }`}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info label="Email" value={account.data?.email ?? "-"} />
          <Info label="Modo" value={account.data?.mode ?? "-"} />
          <Info
            label="Saldo"
            value={formatBullExBalance(account.data?.balance, account.data?.currency)}
          />
          <Info label="Sessão" value={accountStatus.data?.status ?? account.data?.status ?? "-"} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!connected || connectionPending ? (
            <>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                disabled={!hasBackend || syncing || connectionPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Entrar na BullEx
              </button>
              <button
                type="button"
                onClick={() => void handleReconnect()}
                disabled={!hasBackend || syncing || isToggling || connectionPending}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Reconectar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={!hasBackend || syncing || isToggling}
              className="flex items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              Desconectar BullEx
            </button>
          )}
        </div>

        {(disconnect.isError || reconnect.isError) && (
          <p className="mt-3 text-sm text-destructive">
            {disconnect.error instanceof Error
              ? disconnect.error.message
              : reconnect.error instanceof Error
                ? reconnect.error.message
                : "Falha ao atualizar conexão."}
          </p>
        )}
      </section>

      {loginOpen ? (
        <BullExLoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={() => {
            setLoginOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function getConnectionStatusLabel({
  syncing,
  connected,
  cachedGrace,
  connectionPending,
}: {
  syncing: boolean;
  connected: boolean;
  cachedGrace: boolean;
  connectionPending: boolean;
}) {
  if (connectionPending) return "Conectando...";
  if (syncing) return "Sincronizando...";
  if (cachedGrace) return "Reconectando...";
  return connected ? "Conectado" : "Desconectado";
}

function BullExLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const { account, accountStatus, robotState } = useLiveTradingData();
  const connect = useConnectBullex();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const loginFlow = useBullExLoginState(user?.id);
  const abortRef = useRef<AbortController | null>(null);
  const syncStartedRef = useRef(false);
  const hasBackend = !!apiConfig.BASE_URL;
  const progressLabel = getBullExLoginStepLabel(loginFlow);
  const isBusy = connect.isPending || loginFlow.isPending;
  const showTimeoutNote = loginFlow.isPending && loginFlow.visualTimeoutReached;
  const showError =
    loginFlow.phase === "failed" ||
    (connect.isError && !loginFlow.isPending && loginFlow.phase !== "cancelled");

  useEffect(() => {
    setPassword("");
    setSmsCode("");

    return () => {
      abortRef.current?.abort();
      resetBullExLoginState(user?.id);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!loginFlow.isPending || !loginFlow.startedAt) return;

    const remainingMs = Math.max(
      0,
      LOGIN_VISUAL_TIMEOUT_MS - (Date.now() - loginFlow.startedAt),
    );
    const timer = window.setTimeout(() => markBullExLoginVisualTimeout(user?.id), remainingMs);
    return () => window.clearTimeout(timer);
  }, [loginFlow.isPending, loginFlow.startedAt, user?.id]);

  useEffect(() => {
    if (!loginFlow.isPending) return;

    const timer = window.setInterval(() => {
      void account.refetch();
      void accountStatus.refetch();
      void robotState.refetch();
    }, LOGIN_POLL_MS);

    return () => window.clearInterval(timer);
  }, [account, accountStatus, loginFlow.isPending, robotState]);

  useEffect(() => {
    if (!loginFlow.isPending) return;

    updateBullExLoginBackendStatus(connect.data?.status ?? accountStatus.data?.status, user?.id);

    if (accountStatus.data?.status?.toUpperCase() === "LOGIN_FAILED") {
      abortRef.current?.abort();
      abortRef.current = null;
      failBullExLogin("Email ou senha BullEx inválidos.", user?.id);
      setPassword("");
      setSmsCode("");
    }
  }, [accountStatus.data?.status, connect.data?.status, loginFlow.isPending, user?.id]);

  useEffect(() => {
    if (!loginFlow.isPending || syncStartedRef.current) return;
    if (!account.data?.connected) return;

    syncStartedRef.current = true;
    completeBullExLogin(user?.id);
    setPassword("");
    setSmsCode("");
    void syncAfterBullExConnect(queryClient, user?.id).finally(() => {
      onSuccess();
      resetBullExLoginState(user?.id);
      syncStartedRef.current = false;
    });
  }, [account.data?.connected, loginFlow.isPending, onSuccess, queryClient, user?.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password || isBusy) return;

    syncStartedRef.current = false;
    startBullExLogin(email, user?.id);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await connect.mutateAsync({
        email,
        password,
        sms_code: smsCode || undefined,
        signal: controller.signal,
      });
      updateBullExLoginBackendStatus(result.status, user?.id);

      if (result.connected === true || result.status?.toUpperCase() === "CONNECTED") {
        queryClient.setQueryData<BullExAccountState>(
          [...BULLEX_ACCOUNT_QUERY_KEY, user?.id],
          (current) => createOptimisticConnectedBullExAccount(email, current),
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        cancelBullExLogin(user?.id);
      } else {
        failBullExLogin(error instanceof Error ? error.message : "Erro ao conectar.", user?.id);
        setPassword("");
        setSmsCode("");
      }
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    syncStartedRef.current = false;
    cancelBullExLogin(user?.id);
    onClose();
    resetBullExLoginState(user?.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Plug className="h-5 w-5 text-primary" /> Login BullEx
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Entre com seu email e senha da BullEx.
            </p>
          </div>
          <button
            type="button"
            onClick={isBusy ? handleCancel : onClose}
            className="rounded-lg border border-border p-2 transition hover:bg-accent"
            aria-label="Fechar login BullEx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4 text-muted-foreground" /> Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              disabled={!hasBackend || isBusy}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <LockKeyhole className="h-4 w-4 text-muted-foreground" /> Senha
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="******"
              disabled={!hasBackend || isBusy}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">SMS (opcional)</span>
            <input
              type="text"
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              placeholder="123456"
              disabled={!hasBackend || isBusy}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </label>

          {isBusy ? (
            <div className="rounded-lg border border-border bg-background/40 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progressLabel}
              </div>
              <p className="mt-1 text-muted-foreground">
                {loginFlow.phase === "reconnecting"
                  ? "O backend está tentando restaurar sua sessão automaticamente."
                  : "O sistema continua tentando conectar sua conta sem exigir novos cliques."}
              </p>
            </div>
          ) : null}

          {showTimeoutNote ? (
            <p className="text-sm text-warning-foreground">
              90 segundos se passaram, mas o backend ainda pode concluir a conexão. Vamos seguir
              acompanhando automaticamente.
            </p>
          ) : null}

          {showError ? (
            <p className="text-sm text-destructive">
              {loginFlow.failureMessage ??
                (connect.error instanceof Error ? connect.error.message : "Erro ao conectar.")}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!hasBackend || isBusy || !email || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isBusy ? "Conectando..." : "Entrar"}
            </button>
            {isBusy ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-border px-4 py-2.5 font-semibold transition hover:bg-accent"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  );
}
