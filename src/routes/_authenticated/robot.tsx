import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Power, Bot, Plug, Loader2 } from "lucide-react";
import { useBullExAccount } from "@/hooks/useBullExAccount";
import { useConnectBullex, useDisconnectBullex, useReconnectBullex } from "@/lib/useBullex";
import { apiConfig } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/robot")({
  head: () => ({ meta: [{ title: "Robo - BullEx AutoBot" }] }),
  component: RobotPage,
});

type Config = {
  on: boolean;
  accountType: "REAL" | "DEMO";
  stopWin: number;
  stopLoss: number;
  entry: number;
  martingale: number;
};

const DEFAULT: Config = {
  on: false,
  accountType: "DEMO",
  stopWin: 50,
  stopLoss: 30,
  entry: 2,
  martingale: 1,
};

function RobotPage() {
  const [cfg, setCfg] = useState<Config>(() => {
    if (typeof window === "undefined") return DEFAULT;
    try {
      return { ...DEFAULT, ...JSON.parse(localStorage.getItem("robotCfg") || "{}") };
    } catch {
      return DEFAULT;
    }
  });

  useEffect(() => {
    localStorage.setItem("robotCfg", JSON.stringify(cfg));
  }, [cfg]);

  const update = <K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const account = useBullExAccount();
  const connect = useConnectBullex();
  const disconnect = useDisconnectBullex();
  const reconnect = useReconnectBullex();

  const connected = account.data?.connected === true;
  const isToggling = connect.isPending || disconnect.isPending || reconnect.isPending;
  const hasBackend = !!apiConfig.BASE_URL;

  async function handleToggle() {
    if (!hasBackend) return;
    if (connected) {
      await disconnect.mutateAsync();
    } else {
      await reconnect.mutateAsync();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bot className="h-6 w-6" /> Robo
          </h1>
          <p className="text-sm text-muted-foreground">Controle da sua conta BullEx conectada.</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={!hasBackend || isToggling}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            connected ? "bg-destructive text-destructive-foreground" : "bg-success text-success-foreground"
          }`}
        >
          {isToggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          {connected ? "Desconectar" : "Reconectar"}
        </button>
      </header>

      {(disconnect.isError || reconnect.isError) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <strong>Erro:</strong>{" "}
          {disconnect.error instanceof Error
            ? disconnect.error.message
            : reconnect.error instanceof Error
              ? reconnect.error.message
              : "Falha ao alternar a conta"}
        </div>
      )}

      {!hasBackend && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong>Backend nao configurado.</strong> Defina <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_API_BASE_URL</code> e{" "}
          <code className="rounded bg-background/40 px-1 font-mono text-xs">VITE_PANEL_API_KEY</code> no ambiente para controlar o robo.
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${connected ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="font-medium">{connected ? "Conta BullEx conectada" : "Conta BullEx desconectada"}</span>
          <span className="ml-auto rounded-md bg-muted px-3 py-1 text-sm">
            Conta: <strong>{cfg.accountType}</strong>
          </span>
        </div>
      </div>

      <ConnectSection connected={connected} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Tipo de conta</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["DEMO", "REAL"] as const).map((t) => (
              <button
                key={t}
                onClick={() => update("accountType", t)}
                className={`rounded-lg border py-3 font-medium transition ${
                  cfg.accountType === t
                    ? t === "REAL"
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Gerenciamento</h2>
          <NumField label="Stop Win (USD)" value={cfg.stopWin} onChange={(v) => update("stopWin", v)} />
          <NumField label="Stop Loss (USD)" value={cfg.stopLoss} onChange={(v) => update("stopLoss", v)} />
          <NumField label="Entrada inicial (USD)" value={cfg.entry} onChange={(v) => update("entry", v)} step={0.5} />
          <div>
            <label className="mb-1.5 block text-sm font-medium">Martingale (Gales)</label>
            <select
              value={cfg.martingale}
              onChange={(e) => update("martingale", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-input px-3 py-2"
            >
              {[0, 1, 2, 3].map((g) => (
                <option key={g} value={g}>
                  {g === 0 ? "Sem gale" : `G${g}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Dados de mercado ficam disponiveis na tela Grafico.
      </div>
    </div>
  );
}

function ConnectSection({ connected }: { connected: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const connect = useConnectBullex();
  const hasBackend = !!apiConfig.BASE_URL;

  useEffect(() => {
    if (!connected) return;
    setPassword("");
    setSmsCode("");
  }, [connected]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await connect.mutateAsync({ email, password, sms_code: smsCode || undefined });
      setPassword("");
      setSmsCode("");
    } catch {
      setPassword("");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Conectar conta BullEx</h2>
      </div>

      {connected && (
        <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground">
          Conta BullEx conectada. Se quiser sair, use o botao desconectar acima.
        </div>
      )}

      {connect.isSuccess && (
        <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-2 text-sm text-success-foreground">
          Conta conectada com sucesso!
        </div>
      )}

      {connect.isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive-foreground">
          {connect.error instanceof Error ? connect.error.message : "Erro ao conectar"}
        </div>
      )}

      {!connected && (
        <form onSubmit={handleConnect} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Email BullEx</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              disabled={!hasBackend || connect.isPending}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="******"
              disabled={!hasBackend || connect.isPending}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">SMS (opcional)</label>
            <input
              type="text"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              placeholder="123456"
              disabled={!hasBackend || connect.isPending}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!hasBackend || connect.isPending || !email || !password}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Conectar
          </button>
        </form>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}
