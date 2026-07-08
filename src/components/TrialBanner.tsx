import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Sparkles } from "lucide-react";
import { formatRemaining, getTrialRemainingMs, TRIAL_DISCOUNT } from "@/lib/trial";

export function TrialBanner() {
  const [ms, setMs] = useState<number>(() => getTrialRemainingMs());

  useEffect(() => {
    setMs(getTrialRemainingMs());
    const id = setInterval(() => setMs(getTrialRemainingMs()), 1000);
    return () => clearInterval(id);
  }, []);

  if (ms <= 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0 text-primary-foreground">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Periodo gratis ativo</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Tempo restante:{" "}
            <span className="font-mono font-semibold text-foreground">{formatRemaining(ms)}</span>
          </div>
        </div>
      </div>
      <Link
        to="/payments"
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition whitespace-nowrap"
      >
        Tornar-se membro
        <span className="px-2 py-0.5 rounded-md bg-background/15 text-xs font-bold">
          -{TRIAL_DISCOUNT}%
        </span>
      </Link>
    </div>
  );
}
