import { createFileRoute } from "@tanstack/react-router";
import { Bot, Wallet, Plug, Unplug, Gamepad2, Mail, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLiveTradingData } from "@/hooks/useLiveTradingData";
import { apiConfig } from "@/lib/api";
import { formatBullExBalance, isBullExConnected, isBullExDisconnected } from "@/lib/bullexConnection";
import { useBullExLoginState } from "@/lib/bullexLoginState";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - BullEx AutoBot" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { account, accountStatus, robotState } = useLiveTradingData();
  const loginFlow = useBullExLoginState(user?.id);
  const acc = account.data;
  const syncing = account.isLoading || accountStatus.isLoading || robotState.isLoading;
  const cachedGrace = robotState.data?.connection_status_source === "cached_grace";
  const connectionPending = loginFlow.isPending;
  const connected = isBullExConnected({
    account: acc,
    accountStatus: accountStatus.data,
    cachedGrace,
    pendingConnect: connectionPending,
  });
  const robotConnected = connected && (cachedGrace || robotState.data?.connected !== false);
  const accountStatusLabel = getConnectionStatusLabel({
    syncing,
    connected,
    cachedGrace,
    connectionPending,
  });
  const robotStatus = getConnectionStatusLabel({
    syncing,
    connected: robotConnected,
    cachedGrace,
    connectionPending,
  });
  const isLoading = syncing || connectionPending;
  const hasBackend = !!apiConfig.BASE_URL;
  const disconnected =
    !syncing &&
    !connectionPending &&
    isBullExDisconnected({
      account: acc,
      accountStatus: accountStatus.data,
      cachedGrace,
      pendingConnect: connectionPending,
    });
  const apiError = disconnected ? null : account.error;
  const isNoBackend = apiError instanceof Error && apiError.message.includes("VITE_API_BASE_URL");

  const currency = acc?.currency ?? "-";
  const realBalance = acc?.balance;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </header>

      {!hasBackend && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          <strong>Backend nao configurado.</strong> Defina{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_API_BASE_URL</code>{" "}
          e{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">
            VITE_PANEL_API_KEY
          </code>{" "}
          no ambiente para conectar a API BullEx.
        </div>
      )}

      {hasBackend && connectionPending && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          {loginFlow.phase === "reconnecting"
            ? "Reconectando automaticamente..."
            : "Conectando a BullEx..."}
        </div>
      )}

      {hasBackend && !connectionPending && disconnected && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          Conta BullEx desconectada. Clique em Conectar BullEx.
        </div>
      )}

      {hasBackend && apiError && !isNoBackend && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <strong>Erro na API:</strong> {apiError.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LiveCard
          label="Status da conta"
          value={accountStatusLabel}
          Icon={connected ? Plug : Unplug}
          tone={connected ? "positive" : syncing || connectionPending ? undefined : "negative"}
          badge={connectionPending ? "CONNECTING" : syncing ? "SYNC" : connected ? "LIVE" : "OFFLINE"}
        />
        <LiveCard
          label="Saldo"
          value={isLoading ? "-" : formatBullExBalance(realBalance, currency)}
          Icon={Wallet}
          accent
        />
        <LiveCard label="Moeda" value={currency} Icon={Coins} accent />
        <LiveCard
          label="Modo"
          value={acc?.mode ?? "-"}
          Icon={Gamepad2}
          tone={acc?.mode === "REAL" ? "negative" : "positive"}
        />
        <LiveCard
          label="Robo"
          value={robotStatus}
          Icon={Bot}
          tone={
            robotConnected ? "positive" : syncing || connectionPending ? undefined : "negative"
          }
        />
        <LiveCard label="Email BullEx" value={acc?.email ?? "-"} Icon={Mail} />
      </div>
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

function LiveCard({
  label,
  value,
  Icon,
  accent,
  tone,
  badge,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  tone?: "positive" | "negative";
  badge?: string;
}) {
  const isLongValue = value.includes("@") || value.length > 20;
  const valueClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : accent
          ? "text-primary"
          : "text-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${valueClass}`} />
      </div>
      <div
        className={`${isLongValue ? "break-all text-base leading-snug" : "text-2xl"} font-semibold ${valueClass}`}
      >
        {value}
      </div>
      {badge && (
        <Badge variant="secondary" className="mt-2">
          {badge}
        </Badge>
      )}
    </div>
  );
}
