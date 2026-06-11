import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_authenticated/chart")({
  head: () => ({ meta: [{ title: "Gráfico — BullEx AutoBot" }] }),
  component: ChartPage,
});

const ASSETS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "AUD/CAD", "EUR/JPY",
  "BTC/USD", "ETH/USD", "XAU/USD", "USD/BRL", "USD/CHF",
];

type Candle = { o: number; h: number; l: number; c: number; t: number };

function seedCandles(base: number, n = 40): Candle[] {
  const out: Candle[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const o = price;
    const move = (Math.random() - 0.5) * base * 0.004;
    const c = +(o + move).toFixed(5);
    const h = +(Math.max(o, c) + Math.random() * base * 0.002).toFixed(5);
    const l = +(Math.min(o, c) - Math.random() * base * 0.002).toFixed(5);
    out.push({ o, h, l, c, t: Date.now() - (n - i) * 5000 });
    price = c;
  }
  return out;
}

function ChartPage() {
  const [asset, setAsset] = useState(ASSETS[0]);
  const [candles, setCandles] = useState<Candle[]>(() => seedCandles(1.085));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset when asset changes
  useEffect(() => {
    const base = asset.includes("BTC") ? 67000
      : asset.includes("ETH") ? 3400
      : asset.includes("XAU") ? 2350
      : asset.includes("JPY") ? 155
      : asset.includes("BRL") ? 5.2
      : 1.085;
    setCandles(seedCandles(base));
  }, [asset]);

  // Real-time tick simulation
  useEffect(() => {
    const id = setInterval(() => {
      setCandles((prev) => {
        const last = prev[prev.length - 1];
        const base = last.c;
        const move = (Math.random() - 0.5) * base * 0.004;
        const c = +(last.o + move).toFixed(5);
        const h = +Math.max(last.h, c).toFixed(5);
        const l = +Math.min(last.l, c).toFixed(5);
        const updated = [...prev.slice(0, -1), { ...last, c, h, l }];
        // every 5 ticks, push a new candle
        if (Math.random() < 0.25) {
          updated.push({ o: c, c, h: c, l: c, t: Date.now() });
          if (updated.length > 60) updated.shift();
        }
        return updated;
      });
    }, 700);
    return () => clearInterval(id);
  }, [asset]);

  // Draw candles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padding = 30;
    const min = Math.min(...candles.map((c) => c.l));
    const max = Math.max(...candles.map((c) => c.h));
    const range = max - min || 1;
    const cw = (w - padding * 2) / candles.length;
    const y = (v: number) => padding + ((max - v) / range) * (h - padding * 2);

    // grid
    ctx.strokeStyle = "rgba(120,120,120,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = padding + ((h - padding * 2) * i) / 4;
      ctx.beginPath(); ctx.moveTo(padding, yy); ctx.lineTo(w - padding, yy); ctx.stroke();
      ctx.fillStyle = "rgba(140,140,140,0.7)";
      ctx.font = "10px sans-serif";
      ctx.fillText((max - (range * i) / 4).toFixed(4), 2, yy + 3);
    }

    candles.forEach((c, i) => {
      const x = padding + i * cw + cw / 2;
      const up = c.c >= c.o;
      ctx.strokeStyle = up ? "#16a34a" : "#dc2626";
      ctx.fillStyle = up ? "#16a34a" : "#dc2626";
      ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
      const top = y(Math.max(c.o, c.c));
      const bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
      ctx.fillRect(x - cw * 0.35, top, cw * 0.7, bh);
    });
  }, [candles]);

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] ?? last;
  const change = last.c - prev.c;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gráfico</h1>
          <p className="text-sm text-muted-foreground">Candles em tempo real (simulação).</p>
        </div>
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="px-3 py-2 rounded-lg bg-input border border-border text-sm font-medium"
        >
          {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </header>

      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="text-xl font-semibold">{asset}</div>
          <div className="text-2xl font-bold">{last.c.toFixed(asset.includes("BTC") || asset.includes("ETH") ? 2 : 5)}</div>
          <div className={`text-sm font-medium ${change >= 0 ? "text-success" : "text-destructive"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(5)}
          </div>
        </div>
        <canvas ref={canvasRef} className="w-full h-[420px] block" />
      </div>
    </div>
  );
}
