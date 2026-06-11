import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { initTrial, TRIAL_DAYS, TRIAL_DISCOUNT } from "@/lib/trial";

export const Route = createFileRoute("/_authenticated/welcome-trial")({
  ssr: false,
  head: () => ({ meta: [{ title: "Bem-vindo — Período grátis" }] }),
  component: WelcomeTrial,
});

function WelcomeTrial() {
  const navigate = useNavigate();

  useEffect(() => {
    initTrial();
  }, []);

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 mx-auto flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Seu teste grátis começou! 🎉</h1>
        <p className="text-muted-foreground mb-6">
          Você tem <strong>{TRIAL_DAYS} dias</strong> de acesso total ao BullEx AutoBot, sem
          compromisso.
        </p>

        <ul className="text-left space-y-2 mb-6">
          {[
            "Robô de operações automáticas",
            "Gráficos em tempo real",
            "Configurações de Stop Win/Loss e Martingale",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              {t}
            </li>
          ))}
        </ul>

        <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 mb-6 text-sm">
          Assine agora e ganhe{" "}
          <span className="font-bold text-primary">-{TRIAL_DISCOUNT}% de desconto</span>.
        </div>

        <button
          onClick={() => navigate({ to: "/dashboard", replace: true })}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold shadow-sm hover:opacity-90 transition"
        >
          Começar agora
        </button>
      </div>
    </div>
  );
}
