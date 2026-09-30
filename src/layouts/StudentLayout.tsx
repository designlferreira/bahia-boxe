import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CarregandoTela } from "@/components/CarregandoTela";
import { SemProfessor } from "@/components/SemProfessor";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { useAuth } from "@/context/AuthContext";
import { getStudentAdminId } from "@/integrations/backend/api";
import { SemVinculoError } from "@/lib/vinculo";

export function StudentLayout() {
  const { profile, signOut } = useAuth();
  // Mesma chave e mesmas opções das telas do aluno (a consulta é uma só, em cache): aqui só se OLHA se o aluno tem professor.
  const vinculo = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });
  // Só o "sem professor" troca o app; qualquer outra falha (rede, servidor) continua sendo tratada por cada tela, com "Tentar novamente".
  const semProfessor = vinculo.isError && vinculo.error instanceof SemVinculoError;

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Primeiro item do teclado: pula direto para o conteúdo (WCAG 2.4.1). Só aparece quando recebe o foco. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        Pular para o conteúdo
      </a>
      <main id="conteudo" tabIndex={-1} className="flex-1 flex flex-col min-h-0 focus:outline-none">
        {semProfessor ? (
          // Sem barra de baixo: todas as abas dependem do professor e só levariam a telas de erro.
          <SemProfessor onVerificar={() => vinculo.refetch()} verificando={vinculo.isFetching} onSair={() => void signOut()} />
        ) : (
          // As telas carregam sob demanda (lazy em App.tsx): o Suspense fica AQUI para a barra de baixo não sumir enquanto a tela chega.
          <Suspense fallback={<CarregandoTela />}>
            <Outlet />
          </Suspense>
        )}
      </main>
      {!semProfessor && <StudentBottomNav />}
    </div>
  );
}
