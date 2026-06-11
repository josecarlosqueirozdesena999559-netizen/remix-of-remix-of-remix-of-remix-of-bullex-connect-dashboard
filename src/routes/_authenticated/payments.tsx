import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Pagamentos — BullEx AutoBot" }] }),
  component: PaymentsPage,
});

const PLANS = [
  { name: "Mensal", price: 49.9, period: "/mês", features: ["Acesso ao robô", "Suporte por e-mail", "1 conta BullEx"] },
  { name: "Trimestral", price: 129.9, period: "/3 meses", features: ["Tudo do mensal", "Economia de 13%", "Suporte prioritário"], highlight: true },
  { name: "Anual", price: 449.9, period: "/ano", features: ["Tudo do trimestral", "Economia de 25%", "Sinais VIP"] },
];

function PaymentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pagamentos</h1>
        <p className="text-sm text-muted-foreground">Escolha um plano para liberar o AutoBot.</p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`p-6 rounded-2xl border bg-card flex flex-col ${
              p.highlight ? "border-primary ring-2 ring-primary/20" : "border-border"
            }`}
          >
            <div className="text-sm font-medium text-muted-foreground">{p.name}</div>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-bold">R$ {p.price.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">{p.period}</span>
            </div>
            <ul className="space-y-2 mb-6 text-sm flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" /> {f}
                </li>
              ))}
            </ul>
            <button className={`w-full py-2.5 rounded-lg font-medium transition ${
              p.highlight
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "border border-border hover:bg-accent"
            }`}>
              Assinar
            </button>
          </div>
        ))}
      </div>

      <div className="p-5 rounded-2xl bg-card border border-border">
        <h2 className="font-semibold mb-3">Histórico de pagamentos</h2>
        <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
      </div>
    </div>
  );
}
