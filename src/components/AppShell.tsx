import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import {
  Bot,
  CandlestickChart,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  Plug,
  Settings,
} from "lucide-react";
import { TrialBanner } from "@/components/TrialBanner";
import { FloatingRobot } from "@/components/FloatingRobot";

const nav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/chart", label: "Grafico", Icon: CandlestickChart },
  { to: "/bullex", label: "BullEx", Icon: Plug },
  { to: "/robot", label: "Robo", Icon: Bot },
  { to: "/history", label: "Historico", Icon: History },
  { to: "/payments", label: "Pagamentos", Icon: CreditCard },
  { to: "/settings", label: "Configuracoes", Icon: Settings },
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
    <div className="min-h-screen flex flex-col md:flex-row w-full bg-background text-foreground">
      <aside className="md:w-64 md:min-h-screen bg-background border-r border-border flex md:flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Bot className="h-5 w-5" />
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
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
            className="w-full flex items-center justify-center gap-2 text-sm py-2 px-3 rounded-md border border-border bg-card hover:bg-accent transition-colors"
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
