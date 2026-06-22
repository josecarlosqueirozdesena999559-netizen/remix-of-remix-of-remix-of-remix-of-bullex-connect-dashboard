import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar - BullEx AutoBot" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-6 w-6" />
            </div>
            <div className="text-left">
              <div className="text-xl font-bold leading-tight">BullEx AutoBot</div>
              <div className="text-xs text-muted-foreground">Painel de operacoes</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
          <p className="mb-2 text-sm text-muted-foreground">Acesse sua plataforma de operacoes.</p>
          <p className="mb-6 text-xs text-muted-foreground">
            Novos acessos sao criados pelo administrador.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Aguarde..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
