import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarClock,
  CreditCard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin - BullEx AutoBot" }] }),
  component: AdminPage,
});

type PlanStatus = "active" | "expired" | "trial" | "canceled";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: PlanStatus;
  amount: number;
  currency: string;
  startedAt: string | null;
  expiresAt: string | null;
};

type AdminOverview = {
  stats: {
    users: number;
    activePlans: number;
    expiredPlans: number;
    activeTrials: number;
    totalRevenue: number;
    currency: string;
  };
  users: AdminUser[];
};

function AdminPage() {
  const admin = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const response = await apiRequest<unknown>("/admin/overview");
      if (!response.ok) throw new ApiError(response.error, response.code);
      return normalizeAdminOverview(response.data);
    },
    retry: 1,
    staleTime: 15000,
  });

  const overview = admin.data ?? EMPTY_OVERVIEW;
  const activeUsers = overview.users.filter((user) => user.status === "active");
  const expiredUsers = overview.users.filter((user) => user.status === "expired");
  const trialUsers = overview.users.filter((user) => user.status === "trial");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de usuários, planos e testes grátis.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Painel administrativo
        </div>
      </header>

      {admin.error ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            Dados administrativos indisponíveis
          </div>
          <p className="mt-1 text-warning-foreground/80">
            {admin.error instanceof Error
              ? admin.error.message
              : "Não foi possível carregar o resumo administrativo."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStat
          label="Usuários"
          value={formatNumber(overview.stats.users)}
          Icon={Users}
        />
        <AdminStat
          label="Planos ativos"
          value={formatNumber(overview.stats.activePlans)}
          Icon={CreditCard}
          tone="positive"
        />
        <AdminStat
          label="Planos vencidos"
          value={formatNumber(overview.stats.expiredPlans)}
          Icon={CalendarClock}
          tone="negative"
        />
        <AdminStat
          label="Testes grátis ativos"
          value={formatNumber(overview.stats.activeTrials)}
          Icon={ShieldCheck}
        />
        <AdminStat
          label="Valor real"
          value={formatMoney(overview.stats.totalRevenue, overview.stats.currency)}
          Icon={BadgeDollarSign}
          tone="money"
        />
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">Usuários</h2>
            <p className="text-sm text-muted-foreground">
              {overview.users.length > 0
                ? `${overview.users.length} usuários encontrados`
                : "Nenhum usuário retornado pelo backend ainda"}
            </p>
          </div>
          {admin.isFetching ? (
            <span className="rounded-md bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              Atualizando...
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Início</th>
                <th className="px-5 py-3">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {overview.users.map((user) => (
                <tr key={user.id} className="border-b border-border/50">
                  <td className="px-5 py-4">
                    <div className="font-semibold">{user.name || "-"}</div>
                    <div className="max-w-64 break-all text-xs text-muted-foreground">
                      {user.email || user.id}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium">{user.plan || "-"}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    {formatMoney(user.amount, user.currency)}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{formatDate(user.startedAt)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{formatDate(user.expiresAt)}</td>
                </tr>
              ))}
              {overview.users.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-muted-foreground" colSpan={6}>
                    Quando o backend enviar usuários e assinaturas, eles aparecerão aqui.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlanList title="Ativos" users={activeUsers} empty="Nenhum plano ativo" />
        <PlanList title="Vencidos" users={expiredUsers} empty="Nenhum plano vencido" />
        <PlanList title="Teste grátis" users={trialUsers} empty="Nenhum teste grátis ativo" />
      </div>
    </div>
  );
}

function AdminStat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone?: "positive" | "negative" | "money";
}) {
  const toneClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : tone === "money"
          ? "text-primary"
          : "text-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <div className={`break-words text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function PlanList({ title, users, empty }: { title: string; users: AdminUser[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 space-y-3">
        {users.slice(0, 6).map((user) => (
          <div key={`${title}-${user.id}`} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name || user.email || user.id}</div>
                <div className="truncate text-xs text-muted-foreground">{user.plan}</div>
              </div>
              <div className="text-right text-xs font-semibold">
                {formatMoney(user.amount, user.currency)}
              </div>
            </div>
          </div>
        ))}
        {users.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const label = STATUS_LABEL[status];
  const className =
    status === "active"
      ? "bg-success/15 text-success"
      : status === "expired" || status === "canceled"
        ? "bg-destructive/15 text-destructive"
        : "bg-primary/15 text-primary";

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function normalizeAdminOverview(input: unknown): AdminOverview {
  const value = asRecord(input);
  const rawUsers = asArray(value.users ?? value.customers ?? value.subscriptions ?? value.data);
  const users = rawUsers.map(normalizeAdminUser).filter(Boolean) as AdminUser[];
  const statsValue = asRecord(value.stats ?? value.summary ?? value.dashboard);
  const currency = normalizeText(value.currency ?? statsValue.currency, "BRL");

  return {
    stats: {
      users: normalizeNumber(statsValue.users ?? statsValue.total_users ?? statsValue.totalUsers) ?? users.length,
      activePlans:
        normalizeNumber(statsValue.active_plans ?? statsValue.activePlans) ??
        users.filter((user) => user.status === "active").length,
      expiredPlans:
        normalizeNumber(statsValue.expired_plans ?? statsValue.expiredPlans) ??
        users.filter((user) => user.status === "expired").length,
      activeTrials:
        normalizeNumber(statsValue.active_trials ?? statsValue.activeTrials) ??
        users.filter((user) => user.status === "trial").length,
      totalRevenue:
        normalizeNumber(statsValue.total_revenue ?? statsValue.totalRevenue ?? statsValue.real_value) ??
        users.reduce((sum, user) => sum + (user.status === "active" ? user.amount : 0), 0),
      currency,
    },
    users,
  };
}

function normalizeAdminUser(input: unknown): AdminUser | null {
  const value = asRecord(input);
  const id = normalizeText(value.id ?? value.user_id ?? value.userId ?? value.email);
  if (!id) return null;

  const planValue = asRecord(value.plan ?? value.subscription);
  const status = normalizeStatus(value.status ?? value.plan_status ?? value.planStatus ?? planValue.status);
  const currency = normalizeText(value.currency ?? planValue.currency, "BRL");

  return {
    id,
    name: normalizeText(value.name ?? value.full_name ?? value.fullName ?? value.email, "-"),
    email: normalizeText(value.email),
    plan: normalizeText(value.plan_name ?? value.planName ?? planValue.name ?? value.plan, "-"),
    status,
    amount: normalizeNumber(value.amount ?? value.price ?? planValue.amount ?? planValue.price) ?? 0,
    currency,
    startedAt: normalizeOptionalText(value.started_at ?? value.startedAt ?? planValue.started_at),
    expiresAt: normalizeOptionalText(value.expires_at ?? value.expiresAt ?? planValue.expires_at),
  };
}

function normalizeStatus(input: unknown): PlanStatus {
  const status = normalizeText(input).toLowerCase();
  if (status === "active" || status === "ativo") return "active";
  if (status === "expired" || status === "vencido") return "expired";
  if (status === "trial" || status === "teste") return "trial";
  if (status === "canceled" || status === "cancelado") return "canceled";
  return "expired";
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function normalizeText(input: unknown, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function normalizeOptionalText(input: unknown) {
  const value = normalizeText(input);
  return value || null;
}

function normalizeNumber(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const parsed = Number(input.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Ativo",
  expired: "Vencido",
  trial: "Teste grátis",
  canceled: "Cancelado",
};

const EMPTY_OVERVIEW: AdminOverview = {
  stats: {
    users: 0,
    activePlans: 0,
    expiredPlans: 0,
    activeTrials: 0,
    totalRevenue: 0,
    currency: "BRL",
  },
  users: [],
};
