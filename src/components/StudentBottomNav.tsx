import { NavLink } from "react-router-dom";
import { Home, CalendarPlus, ListChecks, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { getModoAgendamentoEfetivo, getStudentAdminId } from "@/integrations/backend/api";

const ALL_ITEMS = [
  { to: "/app/home", label: "Início", icon: Home },
  { to: "/app/agendar", label: "Agendar", icon: CalendarPlus, autosservicoOnly: true },
  { to: "/app/historico", label: "Aulas", icon: ListChecks },
  { to: "/app/minha-conta", label: "Conta", icon: UserRound },
];

export function StudentBottomNav() {
  const { profile } = useAuth();

  const { data: adminId } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  // CLAUDE.md, Etapa 7: a rota /app/agendar já redireciona sozinha quando o professor está em
  // RECORRENCIA (Agendar.tsx) — isso aqui é só não deixar a aba visível oferecendo uma tela que só
  // vai empurrar o aluno pra outro lugar no toque seguinte.
  const { data: modoEfetivo } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });

  const items = ALL_ITEMS.filter((item) => !item.autosservicoOnly || modoEfetivo !== "recorrencia");

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-border bg-background/92 pt-2.5 pb-[22px] backdrop-blur-xl"
      // Mesma coluna centralizada do `.page-container`: no tablet as abas não se espalham.
      style={{ height: 84, paddingInline: "max(0.875rem, calc((100% - 30rem) / 2))" }}
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex-1 h-[52px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform",
              isActive ? "text-[hsl(var(--nav-active))]" : "text-muted-foreground",
            )
          }
        >
          <Icon className="h-[21px] w-[21px]" strokeWidth={2} aria-hidden />
          <span className="text-xs font-semibold">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
