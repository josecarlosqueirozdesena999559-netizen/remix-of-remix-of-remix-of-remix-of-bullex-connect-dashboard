import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Power, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/robot")({
  head: () => ({ meta: [{ title: "Robô — BullEx AutoBot" }] }),
  component: RobotPage,
});

const ASSETS = [
  { symbol: "EUR/USD", payout: 87 },
  { symbol: "GBP/USD", payout: 85 },
  { symbol: "USD/JPY", payout: 84 },
  { symbol: "AUD/CAD", payout: 82 },
  { symbol: "EUR/JPY", payout: 86 },
  { symbol: "BTC/USD", payout: 78 },
  { symbol: "ETH/USD", payout: 76 },
  { symbol: "XAU/USD", payout: 88 },
];

type Config = {
  on: boolean;
  accountType: "REAL" | "DEMO";
  stopWin: number;
  stopLoss: number;
  entry: number;
  martingale: number; // G1, G2...
  asset: string;
};

const DEFAULT: Config = {
  on: false, accountType: "DEMO", stopWin: 50, stopLoss: 30, entry: 2, martingale: 1, asset: "EUR/USD",
};

function RobotPage() {
  const [cfg, setCfg] = useState<Config>(() => {
    if (typeof window === "undefined") return DEFAULT;
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem("robotCfg") || "{}") }; }
    catch { return DEFAULT; }
  });

  useEffect(() => {
    localStorage.setItem("robotCfg", JSON.stringify(cfg));
  }, [cfg]);

  const update = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Bot className="w-6 h-6" /> Robô</h1>
          <p className="text-sm text-muted-foreground">Configuração e controle do AutoBot.</p>
        </div>
        <button
          onClick={() => update("on", !cfg.on)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold shadow-sm transition ${
            cfg.on ? "bg-destructive text-destructive-foreground" : "bg-success text-success-foreground"
          }`}
        >
          <Power className="w-4 h-4" />
          {cfg.on ? "Desligar robô" : "Ligar robô"}
        </button>
      </header>

      <div className="p-5 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${cfg.on ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="font-medium">{cfg.on ? "Robô operando" : "Robô desligado"}</span>
          <span className="ml-auto text-sm px-3 py-1 rounded-md bg-muted">
            Conta: <strong>{cfg.accountType}</strong>
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <h2 className="font-semibold">Tipo de conta</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["DEMO", "REAL"] as const).map((t) => (
              <button
                key={t}
                onClick={() => update("accountType", t)}
                className={`py-3 rounded-lg border font-medium transition ${
                  cfg.accountType === t
                    ? t === "REAL" ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border hover:bg-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <h2 className="font-semibold">Gerenciamento</h2>
          <NumField label="Stop Win (USD)" value={cfg.stopWin} onChange={(v) => update("stopWin", v)} />
          <NumField label="Stop Loss (USD)" value={cfg.stopLoss} onChange={(v) => update("stopLoss", v)} />
          <NumField label="Entrada inicial (USD)" value={cfg.entry} onChange={(v) => update("entry", v)} step={0.5} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Martingale (Gales)</label>
            <select
              value={cfg.martingale}
              onChange={(e) => update("martingale", Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-input border border-border"
            >
              {[0, 1, 2, 3].map((g) => <option key={g} value={g}>{g === 0 ? "Sem gale" : `G${g}`}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Ativos & Payout</h2>
          <span className="text-xs text-muted-foreground">Ativo selecionado: <strong>{cfg.asset}</strong></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2">Ativo</th>
                <th className="py-2">Payout</th>
                <th className="py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {ASSETS.map((a) => (
                <tr key={a.symbol} className="border-b border-border/50">
                  <td className="py-2.5 font-medium">{a.symbol}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                      a.payout >= 85 ? "bg-success/15 text-success-foreground" : "bg-muted text-muted-foreground"
                    }`}>{a.payout}%</span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => update("asset", a.symbol)}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        cfg.asset === a.symbol
                          ? "bg-primary text-primary-foreground"
                          : "border border-border hover:bg-accent"
                      }`}
                    >
                      {cfg.asset === a.symbol ? "Selecionado" : "Selecionar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-input border border-border outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}
