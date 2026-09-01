import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Users, History, Inbox, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getPurchaseRequests } from "@/integrations/backend/api";
import { useAuth } from "@/context/AuthContext";

const items = [
  { to: "/admin/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/admin/alunos", label: "Alunos", icon: Users },
  { to: "/admin/historico", label: "Aulas", icon: History },
  { to: "/admin/solicitacoes", label: "Pedidos", icon: Inbox, badge: true },
  { to: "/admin/minha-conta", label: "Conta", icon: UserRound },
];

export function AdminBottomNav() {
  const { profile } = useAuth();
  const location = useLocation();
  const { data } = useQuery({
    queryKey: ["purchase-requests", profile?.id],
    queryFn: () => getPurchaseRequests(profile!.id),
    enabled: !!profile,
    refetchInterval: 15000,
  });
  const count = data?.length ?? 0;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-0.5 border-t border-border bg-background/92 px-2 pt-2.5 pb-[22px] backdrop-blur-xl"
      style={{ height: 84 }}
    >
      {items.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              "relative flex-1 h-[52px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform",
              isActive || (to === "/admin/alunos" && location.pathname.startsWith("/admin/alunos/"))
                ? "text-primary"
                : "text-muted-foreground/70",
            )
          }
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9.5px] font-semibold">{label}</span>
          {badge && count > 0 && (
            <span className="absolute top-0.5 right-4 min-w-[17px] h-[17px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
