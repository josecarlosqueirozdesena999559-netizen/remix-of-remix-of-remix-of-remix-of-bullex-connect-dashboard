import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, LockKeyhole, Mail, Plug, Power, X } from "lucide-react";
import {
  BULLEX_ACCOUNT_QUERY_KEY,
  type BullExAccountState,
  useBullExAccount,
} from "@/hooks/useBullExAccount";
import { apiConfig } from "@/lib/api";
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

function BullExPage() {
  const account = useBullExAccount();
  const disconnect = useDisconnectBullex();
  const reconnect = useReconnectBullex();
  const [loginOpen, setLoginOpen] = useState(false);
  const connected = account.data?.connected === true;
  const hasBackend = !!apiConfig.BASE_URL;
  const isToggling = disconnect.isPending || reconnect.isPending;

  async function handleDisconnect() {
    if (!hasBackend || !connected) return;
    await disconnect.mutateAsync();
    await account.refetch();
  }

  async function handleReconnect() {
    if (!hasBackend || connected) return;
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
            connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? "Online" : "Offline"}
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
              {connected ? "Conta BullEx online" : "Conta BullEx offline"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? "Sua conta está pronta para ser usada pelo robô."
                : "Faça login para deixar a conta online."}
            </p>
          </div>
          <span
            className={`h-3 w-3 rounded-full ${
              connected ? "animate-pulse bg-success" : "bg-muted-foreground/40"
            }`}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Info label="Email" value={account.data?.email ?? "-"} />
          <Info label="Modo" value={account.data?.mode ?? "-"} />
          <Info
            label="Saldo"
            value={
              account.data?.balance != null
                ? formatBalance(account.data.balance, account.data.currency)
                : "-"
            }
          />
          <Info label="Sessão" value={account.data?.status ?? "-"} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!connected ? (
            <>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                disabled={!hasBackend}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Entrar na BullEx
              </button>
              <button
                type="button"
                onClick={() => void handleReconnect()}
                disabled={!hasBackend || isToggling}
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
              disabled={!hasBackend || isToggling}
              className="flex items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disconnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              Desconectar
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

function BullExLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const connect = useConnectBullex();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const hasBackend = !!apiConfig.BASE_URL;

  useEffect(() => {
    setPassword("");
    setSmsCode("");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) return;

    try {
      await connect.mutateAsync({ email, password, sms_code: smsCode || undefined });
      queryClient.setQueryData<BullExAccountState>(
        [...BULLEX_ACCOUNT_QUERY_KEY, user?.id],
        (current) => ({
          connected: true,
          balance: current?.balance ?? null,
          currency: current?.currency ?? null,
          mode: current?.mode ?? null,
          email,
          requires_2fa: false,
          status: "connected",
        }),
      );
      onSuccess();
      setPassword("");
      setSmsCode("");
      void syncAfterBullExConnect(queryClient, user?.id);
    } catch {
      setPassword("");
      setSmsCode("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
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
            onClick={onClose}
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
              disabled={!hasBackend || connect.isPending}
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
              disabled={!hasBackend || connect.isPending}
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
              disabled={!hasBackend || connect.isPending}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </label>

          {connect.isError ? (
            <p className="text-sm text-destructive">
              {connect.error instanceof Error ? connect.error.message : "Erro ao conectar."}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!hasBackend || connect.isPending || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar
          </button>
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

function formatBalance(value: number, currency: string | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(value);
}
