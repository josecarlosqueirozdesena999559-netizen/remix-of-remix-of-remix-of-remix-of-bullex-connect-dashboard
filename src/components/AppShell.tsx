import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import {
  LayoutDashboard,
  CandlestickChart,
  Bot,
  History,
  CreditCard,
  Settings,
  LogOut,
} from "lucide-react";
import { TrialBanner } from "@/components/TrialBanner";
import { FloatingRobot } from "@/components/FloatingRobot";

const nav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/chart", label: "Gráfico", Icon: CandlestickChart },
  { to: "/robot", label: "Robô", Icon: Bot },
  { to: "/history", label: "Histórico", Icon: History },
  { to: "/payments", label: "Pagamentos", Icon: CreditCard },
  { to: "/settings", label: "Configurações", Icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full">
      <aside className="md:w-64 md:min-h-screen bg-card border-r border-border flex md:flex-col">
        <div className="p-6 flex items-center gap-2 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-xl">
            🤖
          </div>
          <div>
            <div className="font-bold leading-tight">BullEx</div>
            <div className="text-xs text-muted-foreground leading-tight">AutoBot</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 p-3 flex-1 overflow-x-auto">
          {nav.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                preload="render"
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block p-3 border-t border-border">
          <div className="text-xs text-muted-foreground truncate mb-2">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
        {pathname !== "/welcome-trial" && <TrialBanner />}
        {children}
      </main>
      <FloatingRobot userId={user?.id} />
    </div>
  );
}
