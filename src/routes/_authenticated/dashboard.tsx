import { createFileRoute } from "@tanstack/react-router";
import { Wallet, Plug, Unplug, Gamepad2, Mail, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { ApiError, apiConfig } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - BullEx AutoBot" }] }),
  component: Dashboard,
});

function Dashboard() {
  const account = useBullExAccount();
  const acc = account.data;
  const connected = acc?.connected === true;
  const isLoading = account.isLoading;
  const hasBackend = !!apiConfig.BASE_URL;
  const disconnected =
    acc?.connected === false ||
    (account.error instanceof ApiError &&
      (account.error.code === "SESSION_NOT_FOUND" || account.error.code === "SESSION_DISCONNECTED"));
  const apiError = disconnected ? null : account.error;
  const isNoBackend = apiError instanceof Error && apiError.message.includes("VITE_API_BASE_URL");

  const currency = acc?.currency ?? "USD";
  const realBalance = acc?.balance ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo da sua conta BullEx.</p>
      </header>

      {!hasBackend && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong>Backend nao configurado.</strong> Defina <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_API_BASE_URL</code> e{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_PANEL_API_KEY</code> no ambiente para conectar a API BullEx.
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <LiveCard label="Moeda" value={currency} Icon={Coins} accent />
        <LiveCard
          label="Modo"
          value={acc?.mode ?? "-"}
          Icon={Gamepad2}
          tone={acc?.mode === "REAL" ? "negative" : "positive"}
        />
        <LiveCard label="Email BullEx" value={acc?.email ?? "-"} Icon={Mail} />
      </div>
    </div>
  );
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
      <div className={`${isLongValue ? "break-all text-base leading-snug" : "text-2xl"} font-semibold ${valueClass}`}>
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

function money(v: number, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
}
