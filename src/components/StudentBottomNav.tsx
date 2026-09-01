import { NavLink } from "react-router-dom";
import { Home, CalendarPlus, ListChecks, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/app/home", label: "Início", icon: Home },
  { to: "/app/agendar", label: "Agendar", icon: CalendarPlus },
  { to: "/app/historico", label: "Aulas", icon: ListChecks },
  { to: "/app/minha-conta", label: "Conta", icon: UserRound },
];

export function StudentBottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-border bg-background/92 px-3.5 pt-2.5 pb-[22px] backdrop-blur-xl"
      style={{ height: 84 }}
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            cn(
              "flex-1 h-[52px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform",
              isActive ? "text-primary" : "text-muted-foreground/70",
            )
          }
        >
          <Icon className="h-[21px] w-[21px]" strokeWidth={2} />
          <span className="text-[10.5px] font-semibold">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
