import { createFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  ListChecks,
  Loader2,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  getEmptyRobotStats,
  useRobotHistory,
  useRobotStats,
  type RobotHistoryDays,
  type RobotHistoryItem,
} from "@/hooks/useRobotHistory";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico - BullEx AutoBot" }] }),
  component: HistoryPage,
});

const FILTERS: Array<{ days: RobotHistoryDays; label: string }> = [
  { days: 1, label: "Hoje" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
];

function HistoryPage() {
  const [days, setDays] = useState<RobotHistoryDays>(1);
  const history = useRobotHistory(days);
  const statsQuery = useRobotStats(days);
  const items = history.data ?? [];
  const stats = statsQuery.data ?? getEmptyRobotStats();
  const error = history.error ?? statsQuery.error;
  const isRefreshing = history.isFetching || statsQuery.isFetching;

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Histórico</h1>
          <p className="text-sm text-muted-foreground">
            Operações finalizadas e desempenho do robô.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.days}
              type="button"
              onClick={() => setDays(filter.days)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                days === filter.days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {filter.label}
            </button>
          ))}
          {isRefreshing ? <Loader2 className="ml-1 h-4 w-4 animate-spin text-primary" /> : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <strong>Não foi possível carregar o histórico.</strong>{" "}
          {error instanceof Error ? error.message : "Erro na API."}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Win Rate" value={`${formatDecimal(stats.winRate)}%`} Icon={Activity} />
        <StatCard label="Wins" value={String(stats.wins)} Icon={ShieldCheck} tone="positive" />
        <StatCard label="Losses" value={String(stats.losses)} Icon={ShieldX} tone="negative" />
        <StatCard label="Total Trades" value={String(stats.totalTrades)} Icon={ListChecks} />
        <StatCard
          label="Lucro Total"
          value={formatMoney(stats.profit)}
          Icon={CircleDollarSign}
          tone={stats.profit < 0 ? "negative" : "positive"}
        />
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor == null ? "-" : formatDecimal(stats.profitFactor)}
          Icon={BarChart3}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Operações</h2>
          <p className="text-xs text-muted-foreground">
            Atualização automática a cada 30 segundos.
          </p>
        </div>

        {history.isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando operações...
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Nenhuma operação registrada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Lucro/Prejuizo</TableHead>
                <TableHead>Gale</TableHead>
                <TableHead>Gale Step</TableHead>
                <TableHead>Conta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: ComponentType<{ className?: string }>;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className={`break-words text-xl font-semibold sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function HistoryRow({ item }: { item: RobotHistoryItem }) {
  const isWin = item.result === "WIN";
  const resultClass = isWin ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400";
  const directionClass = item.direction === "CALL" ? "text-emerald-400" : "text-red-400";
  const galeClass =
    item.badge === "NORMAL"
      ? "bg-muted text-muted-foreground"
      : item.badge === "GALE WIN"
        ? "bg-emerald-500/15 text-emerald-400"
        : item.badge === "GALE LOSS"
          ? "bg-red-500/15 text-red-400"
          : "bg-amber-500/15 text-amber-300";
  const accountLabel = item.accountMode ?? "-";
  const accountClass =
    item.accountMode === "REAL"
      ? "bg-primary/15 text-primary"
      : "bg-muted text-muted-foreground";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatDate(item.finishedAt ?? item.createdAt)}
      </TableCell>
      <TableCell className="font-medium">{item.active}</TableCell>
      <TableCell className={`font-semibold ${directionClass}`}>{item.direction}</TableCell>
      <TableCell>{formatMoney(item.amount)}</TableCell>
      <TableCell>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${resultClass}`}>
          {item.result}
        </span>
      </TableCell>
      <TableCell className={`font-semibold ${isWin ? "text-emerald-400" : "text-red-400"}`}>
        {formatMoney(item.profit)}
      </TableCell>
      <TableCell>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${galeClass}`}>
          {item.isGale ? "Sim" : "Nao"}
        </span>
      </TableCell>
      <TableCell>{item.galeStep ?? "-"}</TableCell>
      <TableCell>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${accountClass}`}>
          {accountLabel}
        </span>
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
