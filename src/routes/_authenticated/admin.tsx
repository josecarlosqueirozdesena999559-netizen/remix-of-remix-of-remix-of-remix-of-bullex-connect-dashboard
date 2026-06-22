import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  type AdminCreateUserPayload,
  type AdminPlanStatus,
  type AdminUpdateUserPayload,
  adminCreateUser,
  adminOverview,
  adminUpdateUser,
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

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: AdminPlanStatus;
  amount: number;
  currency: string;
  startedAt: string | null;
  expiresAt: string | null;
  nextBillingAt: string | null;
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminPlanStatus>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    plan: "Mensal",
    amount: "0",
    billingDate: getDateInputValue(30),
  });
  const [editForm, setEditForm] = useState({
    plan: "",
    amount: "0",
    status: "active" as AdminPlanStatus,
    expiresAt: "",
    nextBillingAt: "",
    grantAccess: true,
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

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return overview.users.filter((user) => {
      const matchesStatus = statusFilter === "all" ? true : user.status === statusFilter;
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : [user.name, user.email, user.plan, user.id]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesSearch;
    });
  }, [overview.users, search, statusFilter]);

  const activeUsers = filteredUsers.filter((user) => user.status === "active");
  const expiredUsers = filteredUsers.filter((user) => user.status === "expired");
  const trialUsers = filteredUsers.filter((user) => user.status === "trial");
  const selectedUser = filteredUsers.find((user) => user.id === selectedUserId) ?? null;

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
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, payload }: { userId: string; payload: AdminUpdateUserPayload }) => {
      const response = await adminUpdateUser(userId, payload);
      if (!response.ok) throw new ApiError(response.error, response.code);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  function handleCreateUserSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createUserMutation.mutate({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      plan_name: createForm.plan.trim() || "Mensal",
      amount: normalizeMoneyInput(createForm.amount),
      currency: "BRL",
      status: "active",
      started_at: new Date().toISOString(),
      expires_at: toIsoDateTime(createForm.billingDate),
      next_billing_at: toIsoDateTime(createForm.billingDate),
      grant_access: true,
    });
  }

  function openUserEditor(user: AdminUser) {
    setSelectedUserId(user.id);
    setEditForm({
      plan: user.plan,
      amount: String(user.amount),
      status: user.status,
      expiresAt: toDateInputValue(user.expiresAt),
      nextBillingAt: toDateInputValue(user.nextBillingAt ?? user.expiresAt),
      grantAccess: user.status === "active" || user.status === "trial",
    });
  }

  function handleUserUpdateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;

    updateUserMutation.mutate({
      userId: selectedUser.id,
      payload: {
        plan_name: editForm.plan.trim() || selectedUser.plan,
        amount: normalizeMoneyInput(editForm.amount),
        currency: selectedUser.currency || "BRL",
        status: editForm.status,
        expires_at: toIsoDateTime(editForm.expiresAt),
        next_billing_at: toIsoDateTime(editForm.nextBillingAt),
        grant_access: editForm.grantAccess,
        reset_monthly_cycle: true,
      },
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre usuarios, acompanhe planos e libere novos ciclos mensais.
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
            Dados administrativos indisponiveis
          </div>
          <p className="mt-1 text-warning-foreground/80">
            {admin.error instanceof Error
              ? admin.error.message
              : "Nao foi possivel carregar o resumo administrativo."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStat label="Usuarios" value={formatNumber(overview.stats.users)} Icon={Users} />
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
          label="Testes gratis ativos"
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <UserPlus className="h-4 w-4 text-primary" />
              Cadastrar usuario
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O cadastro publico fica bloqueado. Somente o admin cria acessos.
            </p>
          </div>

          <form onSubmit={handleCreateUserSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              value={createForm.name}
              onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
              placeholder="Nome do usuario"
            />
            <Field
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(value) => setCreateForm((current) => ({ ...current, email: value }))}
              placeholder="usuario@email.com"
            />
            <Field
              label="Senha provisoria"
              type="password"
              value={createForm.password}
              onChange={(value) => setCreateForm((current) => ({ ...current, password: value }))}
              placeholder="Minimo de 6 caracteres"
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
              placeholder="0"
              min="0"
              step="0.01"
            />
            <Field
              label="Proxima cobranca"
              type="date"
              value={createForm.billingDate}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, billingDate: value }))
              }
            />
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createUserMutation.isPending ? "Cadastrando..." : "Cadastrar usuario"}
              </button>
            </div>
          </form>

          {createUserMutation.error ? (
            <InlineFeedback
              tone="error"
              message={getErrorMessage(createUserMutation.error, "Falha ao cadastrar usuario.")}
            />
          ) : null}
          {createUserMutation.isSuccess ? (
            <InlineFeedback
              tone="success"
              message="Usuario criado. Ajuste plano e cobranca se precisar."
            />
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Liberar acesso e renovar mensalidade
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione um usuario na lista para reativar acesso ou definir a proxima cobranca.
            </p>
          </div>

          {selectedUser ? (
            <form onSubmit={handleUserUpdateSubmit} className="mt-5 space-y-4">
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <div className="font-semibold">{selectedUser.name || selectedUser.email}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedUser.email || selectedUser.id}
                </div>
              </div>

              <Field
                label="Plano"
                value={editForm.plan}
                onChange={(value) => setEditForm((current) => ({ ...current, plan: value }))}
              />
              <Field
                label="Valor mensal"
                type="number"
                value={editForm.amount}
                onChange={(value) => setEditForm((current) => ({ ...current, amount: value }))}
                min="0"
                step="0.01"
              />
              <SelectField
                label="Status"
                value={editForm.status}
                onChange={(value) =>
                  setEditForm((current) => ({ ...current, status: value as AdminPlanStatus }))
                }
                options={STATUS_OPTIONS}
              />
              <Field
                label="Fim do acesso"
                type="date"
                value={editForm.expiresAt}
                onChange={(value) => setEditForm((current) => ({ ...current, expiresAt: value }))}
              />
              <Field
                label="Proxima cobranca"
                type="date"
                value={editForm.nextBillingAt}
                onChange={(value) =>
                  setEditForm((current) => ({ ...current, nextBillingAt: value }))
                }
              />

              <label className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.grantAccess}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      grantAccess: event.target.checked,
                    }))
                  }
                />
                Liberar uso imediatamente
              </label>

              <button
                type="submit"
                disabled={updateUserMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updateUserMutation.isPending ? "Salvando..." : "Salvar liberacao"}
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Escolha um usuario na tabela abaixo para abrir os controles de liberacao.
            </div>
          )}

          {updateUserMutation.error ? (
            <InlineFeedback
              tone="error"
              message={getErrorMessage(updateUserMutation.error, "Falha ao atualizar usuario.")}
            />
          ) : null}
          {updateUserMutation.isSuccess ? (
            <InlineFeedback tone="success" message="Acesso e ciclo mensal atualizados." />
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">Usuarios</h2>
            <p className="text-sm text-muted-foreground">
              {filteredUsers.length > 0
                ? `${filteredUsers.length} usuarios encontrados`
                : "Nenhum usuario retornado pelo backend ainda"}
            </p>
          </div>
          {admin.isFetching ? (
            <span className="rounded-md bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              Atualizando...
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 border-b border-border p-5 lg:grid-cols-[1fr_auto]">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email ou plano"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => {
              const active = statusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-5 py-3">Usuario</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Inicio</th>
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Proxima cobranca</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
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
                  <td className="px-5 py-4 text-muted-foreground">
                    {formatDate(user.nextBillingAt)}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => openUserEditor(user)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-accent"
                    >
                      Gerenciar
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-muted-foreground" colSpan={8}>
                    Quando o backend enviar usuarios e assinaturas, eles aparecerao aqui.
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
        <PlanList title="Teste gratis" users={trialUsers} empty="Nenhum teste gratis ativo" />
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
          <div
            key={`${title}-${user.id}`}
            className="rounded-lg border border-border bg-background/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {user.name || user.email || user.id}
                </div>
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
      className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
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
      users:
        normalizeNumber(statsValue.users ?? statsValue.total_users ?? statsValue.totalUsers) ??
        users.length,
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
        normalizeNumber(
          statsValue.total_revenue ?? statsValue.totalRevenue ?? statsValue.real_value,
        ) ?? users.reduce((sum, user) => sum + (user.status === "active" ? user.amount : 0), 0),
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
    startedAt: normalizeOptionalText(value.started_at ?? value.startedAt ?? planValue.started_at),
    expiresAt: normalizeOptionalText(value.expires_at ?? value.expiresAt ?? planValue.expires_at),
    nextBillingAt: normalizeOptionalText(
      value.next_billing_at ??
        value.nextBillingAt ??
        planValue.next_billing_at ??
        planValue.nextBillingAt,
    ),
  };
}

function normalizeStatus(input: unknown): AdminPlanStatus {
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

const STATUS_LABEL: Record<AdminPlanStatus, string> = {
  active: "Ativo",
  expired: "Vencido",
  trial: "Teste gratis",
  canceled: "Cancelado",
};

const FILTER_OPTIONS: readonly { value: "all" | AdminPlanStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "expired", label: "Vencidos" },
  { value: "trial", label: "Teste" },
  { value: "canceled", label: "Cancelados" },
];

const STATUS_OPTIONS: readonly { value: AdminPlanStatus; label: string }[] = [
  { value: "active", label: "Ativo" },
  { value: "expired", label: "Vencido" },
  { value: "trial", label: "Teste" },
  { value: "canceled", label: "Cancelado" },
];

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
