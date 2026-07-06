import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
  ShieldCheck,
} from "lucide-react";
import { TrialBanner } from "@/components/TrialBanner";
import { FloatingRobot } from "@/components/FloatingRobot";
import { LiveTradingDataProvider } from "@/hooks/useLiveTradingData";
import { isAdminUser } from "@/lib/adminAccess";
import { resetBullExAccountState } from "@/hooks/useBullExAccount";

const nav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/chart", label: "Gráfico", Icon: CandlestickChart },
  { to: "/bullex", label: "ElCapo", Icon: Plug },
  { to: "/robot", label: "Robô", Icon: Bot },
  { to: "/history", label: "Histórico", Icon: History },
  { to: "/payments", label: "Pagamentos", Icon: CreditCard },
] as const;

const adminNav = { to: "/admin", label: "Admin", Icon: ShieldCheck } as const;
const adminOnlyNav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  adminNav,
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const visibleNav = isAdminUser(user) ? adminOnlyNav : nav;

  async function handleLogout() {
    await supabase.auth.signOut();
    resetBullExAccountState(user?.id);
    queryClient.clear();
    navigate({ to: "/login", replace: true });
  }

  return (
    <LiveTradingDataProvider userId={user?.id}>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row">
        <aside className="mobile-safe-top border-b border-border/80 bg-background/95 backdrop-blur md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:backdrop-blur-0">
        <div className="flex items-center gap-3 px-4 py-4 sm:px-6 md:p-6">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold leading-tight">ElCapo</div>
          </div>
        </div>
        <nav className="scrollbar-none flex gap-2 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-1 md:px-3 md:pb-0">
          {visibleNav.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                preload="intent"
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors md:shrink ${
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
        <div className="border-t border-border/70 p-3 md:mt-auto">
          <div className="mb-2 truncate text-xs text-muted-foreground">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
        </aside>

        <main
          className={`min-w-0 flex-1 px-4 py-5 sm:px-5 md:px-8 md:py-8 ${
            pathname === "/chart" ? "max-w-[1680px]" : "max-w-7xl"
          }`}
        >
          {pathname !== "/welcome-trial" && <TrialBanner />}
          {children}
        </main>
        <FloatingRobot userId={user?.id} />
      </div>
    </LiveTradingDataProvider>
  );
}
