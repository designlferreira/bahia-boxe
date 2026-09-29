import { LayoutDashboard, CalendarDays, Users, History, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { countPendenciasDoProfessor } from "@/integrations/backend/api";
import { useAuth } from "@/context/AuthContext";
import { BottomNavItem } from "@/components/BottomNavItem";

/**
 * Cinco abas (eram seis, com "Pedidos"): com seis, cada aba tinha 49-58px e o rótulo era de 9,5px. "Pedidos" saiu da barra — o Painel
 * ("Resolver agora") e o sino já avisam, e a tela continua em /admin/solicitacoes. O número de pendências vive na aba Painel.
 */
export function AdminBottomNav() {
  const { profile } = useAuth();
  // A chave começa com "admin-dashboard" DE PROPÓSITO: Pedidos, Painel, Agenda e o detalhe da aula já invalidam esse prefixo quando o
  // professor decide algo, então o número acompanha sem cada tela precisar conhecer esta chave. A cada 60s (era 15s, com uma consulta que
  // trazia alunos, modelos e pacotes), e só com o app visível (`refetchIntervalInBackground` é falso por padrão).
  const { data } = useQuery({
    queryKey: ["admin-dashboard", "pendencias", profile?.id],
    queryFn: () => countPendenciasDoProfessor(profile!.id),
    enabled: !!profile,
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const count = data ?? 0;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-border bg-background/92 pt-2.5 pb-[22px] backdrop-blur-xl"
      // Mesma coluna centralizada do `.page-container`: no tablet as abas não se espalham.
      style={{ height: 84, paddingInline: "max(0.875rem, calc((100% - 30rem) / 2))" }}
    >
      <BottomNavItem to="/admin/dashboard" label="Painel" icon={LayoutDashboard} prefixos={["/admin/solicitacoes"]}>
        {count > 0 && (
          <>
            <span aria-hidden className="absolute top-0.5 right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
            <span className="sr-only">
              , {count} {count === 1 ? "pendência" : "pendências"}
            </span>
          </>
        )}
      </BottomNavItem>
      {/* O detalhe de uma aula acende a Agenda (de onde o professor mais chega a ele); as telas de Minha conta, a aba Conta. Antes só
          `/admin/alunos/` tinha exceção e, nas outras telas de segundo nível, nenhuma aba acendia. */}
      <BottomNavItem to="/admin/agenda" label="Agenda" icon={CalendarDays} prefixos={["/admin/aula"]} />
      <BottomNavItem to="/admin/alunos" label="Alunos" icon={Users} />
      <BottomNavItem to="/admin/historico" label="Aulas" icon={History} />
      <BottomNavItem
        to="/admin/minha-conta"
        label="Conta"
        icon={UserRound}
        prefixos={["/admin/pacotes", "/admin/disponibilidade", "/admin/orientacoes", "/admin/perfil-alunos", "/admin/configuracoes"]}
      />
    </nav>
  );
}
