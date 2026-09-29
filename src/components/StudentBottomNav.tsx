import { Home, CalendarPlus, ListChecks, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { getModoAgendamentoEfetivo, getStudentAdminId } from "@/integrations/backend/api";
import { BottomNavItem } from "@/components/BottomNavItem";

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

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-border bg-background/92 pt-2.5 pb-[22px] backdrop-blur-xl"
      // Mesma coluna centralizada do `.page-container`: no tablet as abas não se espalham.
      style={{ height: 84, paddingInline: "max(0.875rem, calc((100% - 30rem) / 2))" }}
    >
      <BottomNavItem to="/app/home" label="Início" icon={Home} />
      {modoEfetivo !== "recorrencia" && <BottomNavItem to="/app/agendar" label="Agendar" icon={CalendarPlus} />}
      <BottomNavItem to="/app/historico" label="Aulas" icon={ListChecks} />
      <BottomNavItem to="/app/minha-conta" label="Conta" icon={UserRound} />
    </nav>
  );
}
