import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { apiConfig } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — BullEx AutoBot" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Sua conta e ambiente.</p>
      </header>

      <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
        <h2 className="font-semibold">Conta</h2>
        <Field label="Email" value={user?.email ?? "—"} />
        <Field label="ID do usuário" value={user?.id ?? "—"} mono />
        <button
          onClick={logout}
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition"
        >
          Sair
        </button>
      </div>

      <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
        <h2 className="font-semibold">Backend</h2>
        <Field label="VITE_API_BASE_URL" value={apiConfig.BASE_URL || "não configurada"} mono />
        <Field label="VITE_PANEL_API_KEY" value={apiConfig.hasKey ? "configurada" : "não configurada"} />
        <p className="text-xs text-muted-foreground">
          Defina essas variáveis no ambiente para conectar o painel ao backend BullEx.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""} break-all`}>{value}</div>
    </div>
  );
}
