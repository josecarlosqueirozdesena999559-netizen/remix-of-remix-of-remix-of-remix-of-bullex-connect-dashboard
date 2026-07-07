import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeDollarSign,
  Gift,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  type AdminCreateUserPayload,
  type AdminPlanStatus,
  adminCreateUser,
  adminOverview,
  ApiError,
} from "@/lib/api";
import { isAdminUser } from "@/lib/adminAccess";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin - BullEx AutoBot" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !isAdminUser(data.session?.user)) {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: AdminPage,
});

type AdminView = "dashboard" | "cadastro" | "ativos";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: AdminPlanStatus;
  amount: number;
  currency: string;
  expiresAt: string | null;
};

type AdminOverview = {
  stats: {
    activePlans: number;
    activeTrials: number;
    monthlyProfit: number;
    currency: string;
  };
  users: AdminUser[];
};

const TRIAL_DAYS = 7;

function AdminPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<AdminView>("dashboard");
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    plan: "Mensal",
    amount: "0",
    billingDate: getDateInputValue(30),
    status: "active" as AdminPlanStatus,
  });

  const admin = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const response = await adminOverview();
      if (!response.ok) throw new ApiError(response.error, response.code);
      return normalizeAdminOverview(response.data);
    },
    retry: 1,
    staleTime: 15000,
  });

  const overview = admin.data ?? EMPTY_OVERVIEW;
  const activeUsers = useMemo(
    () => overview.users.filter((user) => user.status === "active"),
    [overview.users],
  );
  const filteredActiveUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return activeUsers;

    return activeUsers.filter((user) =>
      [user.name, user.email, user.plan, user.id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [activeUsers, search]);

  const createUserMutation = useMutation({
    mutationFn: async (payload: AdminCreateUserPayload) => {
      const response = await adminCreateUser(payload);
      if (!response.ok) throw new ApiError(response.error, response.code);
      return response.data;
    },
    onSuccess: () => {
      setCreateForm({
        name: "",
        email: "",
        password: "",
        plan: "Mensal",
        amount: "0",
        billingDate: getDateInputValue(30),
        status: "active",
      });
      setView("ativos");
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  function handleCreateUserSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const isTrial = createForm.status === "trial";
    const accessEndDate = isTrial ? getDateInputValue(TRIAL_DAYS) : createForm.billingDate;
    const amount = isTrial ? 0 : normalizeMoneyInput(createForm.amount);

    createUserMutation.mutate({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      plan_name: isTrial ? "Teste gratis" : createForm.plan.trim() || "Mensal",
      amount,
      currency: "BRL",
      status: createForm.status,
      started_at: new Date().toISOString(),
      expires_at: toIsoDateTime(accessEndDate),
      next_billing_at: toIsoDateTime(accessEndDate),
      grant_access: true,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Painel administrativo
        </div>
      </header>

      {admin.error ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Dados administrativos indisponiveis
          </div>
          <p className="mt-1 text-muted-foreground">
            {admin.error instanceof Error
              ? admin.error.message
              : "Nao foi possivel carregar o resumo administrativo."}
          </p>
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
        <AdminMenuButton active={view === "dashboard"} onClick={() => setView("dashboard")}>
          Dashboard
        </AdminMenuButton>
        <AdminMenuButton active={view === "cadastro"} onClick={() => setView("cadastro")}>
          Cadastro de clientes
        </AdminMenuButton>
        <AdminMenuButton active={view === "ativos"} onClick={() => setView("ativos")}>
          Clientes ativos
        </AdminMenuButton>
      </nav>

      {view === "dashboard" ? (
        <section className="grid gap-4 md:grid-cols-3">
          <AdminStat
            label="Clientes ativos"
            value={formatNumber(overview.stats.activePlans)}
            Icon={Users}
            tone="positive"
          />
          <AdminStat
            label="Teste gratis"
            value={formatNumber(overview.stats.activeTrials)}
            Icon={Gift}
          />
          <AdminStat
            label="Lucro mensal"
            value={formatMoney(overview.stats.monthlyProfit, overview.stats.currency)}
            Icon={BadgeDollarSign}
            tone="money"
          />
        </section>
      ) : null}

      {view === "cadastro" ? (
        <section className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <UserPlus className="h-4 w-4 text-primary" />
              Cadastro de clientes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie clientes pagantes ou libere periodo de teste gratis.
            </p>
          </div>

          <form
            onSubmit={handleCreateUserSubmit}
            className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"
          >
            <Field
              label="Nome"
              value={createForm.name}
              onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
              placeholder="Nome do cliente"
            />
            <Field
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))}
              placeholder="cliente@email.com"
            />
            <Field
              label="Senha provisoria"
              type="password"
              value={createForm.password}
              onChange={(value) => setCreateForm((current) => ({ ...current, password: value }))}
              placeholder="Minimo de 6 caracteres"
            />
            <SelectField
              label="Tipo"
              value={createForm.status}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, status: value as AdminPlanStatus }))
              }
              options={CREATE_STATUS_OPTIONS}
            />
            <Field
              label="Plano"
              value={createForm.plan}
              onChange={(value) => setCreateForm((current) => ({ ...current, plan: value }))}
              placeholder="Mensal"
            />
            <Field
              label="Valor mensal"
              type="number"
              value={createForm.amount}
              onChange={(value) => setCreateForm((current) => ({ ...current, amount: value }))}
              min="0"
              step="0.01"
            />
            <Field
              label="Vencimento"
              type="date"
              value={createForm.billingDate}
              onChange={(value) => setCreateForm((current) => ({ ...current, billingDate: value }))}
            />
            <div className="flex items-end">
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createUserMutation.isPending ? "Cadastrando..." : "Cadastrar cliente"}
              </button>
            </div>
          </form>

          <div className="px-5 pb-5">
            {createUserMutation.error ? (
              <InlineFeedback
                tone="error"
                message={getErrorMessage(createUserMutation.error, "Falha ao cadastrar cliente.")}
              />
            ) : null}
            {createUserMutation.isSuccess ? (
              <InlineFeedback tone="success" message="Cliente cadastrado com acesso liberado." />
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "ativos" ? (
        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Clientes ativos
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Clientes pagantes com acesso liberado.
              </p>
            </div>
            {admin.isFetching ? (
              <span className="rounded-md bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                Atualizando...
              </span>
            ) : null}
          </div>

          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cliente ativo"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
              <span className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                {formatNumber(filteredActiveUsers.length)} ativos
              </span>
            </div>

            <ActiveClientsTable users={filteredActiveUsers} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AdminMenuButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ActiveClientsTable({ users }: { users: AdminUser[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Plano</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Valor</th>
            <th className="px-3 py-3">Vencimento</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-border/50">
              <td className="px-3 py-4">
                <div className="font-semibold">{user.name || "-"}</div>
                <div className="max-w-72 break-all text-xs text-muted-foreground">
                  {user.email || user.id}
                </div>
              </td>
              <td className="px-3 py-4 font-medium">{user.plan || "-"}</td>
              <td className="px-3 py-4">
                <StatusBadge status={user.status} />
              </td>
              <td className="px-3 py-4 font-semibold">
                {formatMoney(user.amount, user.currency)}
              </td>
              <td className="px-3 py-4 text-muted-foreground">{formatDate(user.expiresAt)}</td>
            </tr>
          ))}
          {users.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-muted-foreground" colSpan={5}>
                Nenhum cliente ativo encontrado.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
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
  tone?: "positive" | "money";
}) {
  const toneClass =
    tone === "positive" ? "text-success" : tone === "money" ? "text-primary" : "text-foreground";

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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        required={type !== "date"}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InlineFeedback({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {message}
    </div>
  );
}

function StatusBadge({ status }: { status: AdminPlanStatus }) {
  const label = STATUS_LABEL[status];
  const className =
    status === "active"
      ? "bg-success/15 text-success"
      : status === "trial"
        ? "bg-primary/15 text-primary"
        : "bg-destructive/15 text-destructive";

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
  const inferredProfit = users.reduce(
    (sum, user) => sum + (user.status === "active" ? user.amount : 0),
    0,
  );

  return {
    stats: {
      activePlans:
        normalizeNumber(statsValue.active_plans ?? statsValue.activePlans) ??
        users.filter((user) => user.status === "active").length,
      activeTrials:
        normalizeNumber(statsValue.active_trials ?? statsValue.activeTrials) ??
        users.filter((user) => user.status === "trial").length,
      monthlyProfit:
        normalizeNumber(
          statsValue.monthly_profit ??
            statsValue.monthlyProfit ??
            statsValue.monthly_revenue ??
            statsValue.monthlyRevenue,
        ) ?? inferredProfit,
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
  const status = normalizeStatus(
    value.status ?? value.plan_status ?? value.planStatus ?? planValue.status,
  );
  const currency = normalizeText(value.currency ?? planValue.currency, "BRL");

  return {
    id,
    name: normalizeText(value.name ?? value.full_name ?? value.fullName ?? value.email, "-"),
    email: normalizeText(value.email),
    plan: normalizeText(value.plan_name ?? value.planName ?? planValue.name ?? value.plan, "-"),
    status,
    amount:
      normalizeNumber(value.amount ?? value.price ?? planValue.amount ?? planValue.price) ?? 0,
    currency,
    expiresAt: normalizeOptionalText(value.expires_at ?? value.expiresAt ?? planValue.expires_at),
  };
}

function normalizeStatus(input: unknown): AdminPlanStatus {
  const status = normalizeText(input).toLowerCase();
  if (status === "active" || status === "ativo") return "active";
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

const STATUS_LABEL: Record<AdminPlanStatus, string> = {
  active: "Ativo",
  expired: "Vencido",
  trial: "Teste gratis",
  canceled: "Cancelado",
};

const CREATE_STATUS_OPTIONS: readonly { value: AdminPlanStatus; label: string }[] = [
  { value: "active", label: "Cliente ativo" },
  { value: "trial", label: "Teste gratis" },
];

const EMPTY_OVERVIEW: AdminOverview = {
  stats: {
    activePlans: 0,
    activeTrials: 0,
    monthlyProfit: 0,
    currency: "BRL",
  },
  users: [],
};

function normalizeMoneyInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDateInputValue(daysFromNow = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return toDateInputValue(date.toISOString());
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string) {
  if (!value) return null;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
