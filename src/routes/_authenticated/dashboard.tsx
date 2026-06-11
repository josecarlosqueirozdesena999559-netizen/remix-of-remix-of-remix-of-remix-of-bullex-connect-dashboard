import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Plug, Unplug, Gamepad2, Mail, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBullexAccount, useBullexBalance } from "@/lib/useBullex";
import { ApiError, apiConfig } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - BullEx AutoBot" }] }),
  component: Dashboard,
});

function Dashboard() {
  const account = useBullexAccount();
  const acc = account.data;
  const connected = acc?.connected === true || acc?.status === "connected";
  const balance = useBullexBalance(connected);

  const isLoading = account.isLoading || balance.isLoading;
  const hasBackend = !!apiConfig.BASE_URL;
  const disconnected = account.error instanceof ApiError && account.error.code === "SESSION_NOT_FOUND";
  const apiError = disconnected ? null : account.error || balance.error;
  const isNoBackend = apiError instanceof Error && apiError.message.includes("VITE_API_BASE_URL");

  const bal = balance.data;
  const currency = bal?.currency ?? acc?.currency ?? "USD";
  const realBalance = bal?.balance ?? acc?.balance ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo da sua conta BullEx.</p>
      </header>

      {!hasBackend && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong>Backend não configurado.</strong> Defina <code className="font-mono text-xs bg-background/40 px-1 rounded">VITE_API_BASE_URL</code> e <code className="font-mono text-xs bg-background/40 px-1 rounded">VITE_PANEL_API_KEY</code> no ambiente para conectar à API BullEx.
        </div>
      )}

      {hasBackend && disconnected && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          Conta BullEx desconectada
        </div>
      )}

      {hasBackend && apiError && !isNoBackend && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <strong>Erro na API:</strong> {apiError.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <LiveCard
          label="Status da conta"
          value={connected ? "Conectado" : "Desconectado"}
          Icon={connected ? Plug : Unplug}
          tone={connected ? "positive" : "negative"}
          badge={connected ? "LIVE" : "OFFLINE"}
        />
        <LiveCard
          label="Saldo"
          value={realBalance !== null ? money(realBalance, currency) : isLoading ? "-" : "N/A"}
          Icon={Wallet}
          accent
        />
        <LiveCard
          label="Moeda"
          value={currency}
          Icon={Coins}
          accent
        />
        <LiveCard
          label="Modo"
          value={acc?.mode ?? "-"}
          Icon={Gamepad2}
          tone={acc?.mode === "REAL" ? "negative" : "positive"}
        />
        <LiveCard
          label="Email BullEx"
          value={acc?.email ?? "-"}
          Icon={Mail}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Esta tela exibe somente dados retornados pelo BullEx Gateway para o usuário autenticado.
      </div>
    </div>
  );
}

function LiveCard({
  label, value, Icon, accent, tone, badge,
}: {
  label: string; value: string; Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean; tone?: "positive" | "negative"; badge?: string;
}) {
  const valueClass = tone === "positive" ? "text-success"
    : tone === "negative" ? "text-destructive"
    : accent ? "text-primary" : "text-foreground";
  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${valueClass}`} />
      </div>
      <div className={`text-2xl font-semibold ${valueClass}`}>{value}</div>
      {badge && (
        <Badge variant="secondary" className="mt-2">
          {badge}
        </Badge>
      )}
    </div>
  );
}

function money(v: number, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
}
