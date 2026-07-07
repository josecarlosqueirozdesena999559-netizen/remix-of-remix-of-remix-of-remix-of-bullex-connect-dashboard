import { createFileRoute } from "@tanstack/react-router";

const TRADEROOM_URL = "https://trade.bull-ex.com/traderoom";

export const Route = createFileRoute("/_authenticated/chart")({
  ssr: false,
  head: () => ({ meta: [{ title: "Gráfico - BullEx AutoBot" }] }),
  component: ChartPage,
});

function ChartPage() {
  return (
    <div className="min-w-0 space-y-4">
      <header>
        <h1 className="text-xl font-semibold sm:text-2xl">Gráfico BullEx</h1>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <iframe
          title="BullEx Traderoom"
          src={TRADEROOM_URL}
          className="h-[calc(100vh-190px)] min-h-[620px] w-full border-0 bg-background"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </section>
    </div>
  );
}
