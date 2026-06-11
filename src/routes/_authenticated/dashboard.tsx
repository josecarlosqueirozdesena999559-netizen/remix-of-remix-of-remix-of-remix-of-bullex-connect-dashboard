import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Target, Wallet, Trophy, Percent, Plug, Unplug, Gamepad2, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBullexAccount, useBullexBalance } from "@/lib/useBullex";
import { apiConfig } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — BullEx AutoBot" }] }),
  component: Dashboard,
});

function Dashboard() {
  const account = useBullexAccount();
  const balance = useBullexBalance();

  const isLoading = account.isLoading || balance.isLoading;
  const hasBackend = !!apiConfig.BASE_URL;
  const apiError = account.error || balance.error;
  const isNoBackend = apiError instanceof Error && apiError.message.includes("VITE_API_BASE_URL");

  // Mock metrics (frontend-only). Will be wired to backend later.
  const stats = useMemo(() => {
    const wins = 38;
    const losses = 14;
    const total = wins + losses;
    const profit = 842.5;
    const loss = 312.0;
    const net = profit - loss;
    const winRate = total ? (wins / total) * 100 : 0;
    return { wins, losses, profit, loss, net, winRate };
  }, []);

  const acc = account.data;
  const bal = balance.data;
  const connected = acc?.status === "connected";
  const currency = bal?.currency ?? acc?.currency ?? "USD";
  const realBalance = bal?.balance ?? acc?.balance ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo das operações e status da conta.</p>
      </header>

      {!hasBackend && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong>Backend não configurado.</strong> Defina <code className="font-mono text-xs bg-background/40 px-1 rounded">VITE_API_BASE_URL</code> e <code className="font-mono text-xs bg-background/40 px-1 rounded">VITE_PANEL_API_KEY</code> no ambiente para conectar à API BullEx.
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
          value={realBalance !== null ? money(realBalance, currency) : isLoading ? "—" : "N/A"}
          Icon={Wallet}
          accent
        />
        <LiveCard
          label="Modo"
          value={acc?.mode ?? "—"}
          Icon={Gamepad2}
          tone={acc?.mode === "REAL" ? "negative" : "positive"}
        />
        <LiveCard
          label="Resultado do dia"
          value={acc?.dayResult ?? "—"}
          Icon={TrendingUpIcon}
          tone={acc?.dayResult === "WIN" ? "positive" : acc?.dayResult === "LOSS" ? "negative" : undefined}
          suffix={acc?.dayProfit ? ` (${money(acc.dayProfit, currency)})` : undefined}
        />
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Métricas do mês (simulado)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} Icon={Percent} tone="positive" />
          <StatCard label="Resultado do mês" value={money(stats.net)} Icon={Trophy} tone={stats.net >= 0 ? "positive" : "negative"} />
          <StatCard label="Wins" value={String(stats.wins)} Icon={TrendingUp} tone="positive" />
          <StatCard label="Loss" value={String(stats.losses)} Icon={TrendingDown} tone="negative" />
          <StatCard label="Lucro no mês" value={money(stats.profit)} Icon={Target} tone="positive" />
          <StatCard label="Perca no mês" value={money(stats.loss)} Icon={Target} tone="negative" />
        </div>
      </section>
    </div>
  );
}

function LiveCard({
  label, value, Icon, accent, tone, badge, suffix,
}: {
  label: string; value: string; Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean; tone?: "positive" | "negative"; badge?: string; suffix?: string;
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
      <div className="flex items-baseline gap-2">
        <div className={`text-2xl font-semibold ${valueClass}`}>{value}</div>
        {suffix && <div className="text-sm text-muted-foreground">{suffix}</div>}
      </div>
      {badge && (
        <Badge variant="secondary" className="mt-2">
          {badge}
        </Badge>
      )}
    </div>
  );
}

function StatCard({
  label, value, Icon, accent, tone,
}: {
  label: string; value: string; Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean; tone?: "positive" | "negative";
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
    </div>
  );
}

function money(v: number, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
}
