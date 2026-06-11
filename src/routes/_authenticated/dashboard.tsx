import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Target, Wallet, Trophy, Percent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — BullEx AutoBot" }] }),
  component: Dashboard,
});

function Dashboard() {
  // Mock metrics (frontend-only). Will be wired to backend later.
  const stats = useMemo(() => {
    const wins = 38;
    const losses = 14;
    const total = wins + losses;
    const profit = 842.5;
    const loss = 312.0;
    const net = profit - loss;
    const winRate = total ? (wins / total) * 100 : 0;
    return { wins, losses, profit, loss, net, winRate, balance: 1542.87 };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo das operações no mês.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Saldo da conta" value={money(stats.balance)} Icon={Wallet} accent />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} Icon={Percent} tone="positive" />
        <StatCard label="Resultado do mês" value={money(stats.net)} Icon={Trophy} tone={stats.net >= 0 ? "positive" : "negative"} />
        <StatCard label="Wins" value={String(stats.wins)} Icon={TrendingUp} tone="positive" />
        <StatCard label="Loss" value={String(stats.losses)} Icon={TrendingDown} tone="negative" />
        <StatCard label="Lucro no mês" value={money(stats.profit)} Icon={Target} tone="positive" />
        <StatCard label="Perca no mês" value={money(stats.loss)} Icon={Target} tone="negative" />
      </div>
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

function money(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(v);
}
