import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { BoxingProfileResultView } from "@/components/BoxingProfileResultView";
import { formatDateWithYear } from "@/lib/dateUtils";
import {
  getBoxingProfileAssessment,
  getBoxingProfileHistory,
  getStudentAdminId,
  getWhatsappDoProfessor,
  studentIdForProfile,
} from "@/integrations/backend/api";

/**
 * Uma avaliação ESPECÍFICA (aberta pelo histórico). Logo depois de enviar o questionário o aluno vai para o Perfil de Boxe
 * (`/app/perfil-lutador`), que mostra o resultado mais recente com o combinado, o selo de parcial e os botões — esta tela ficou só para
 * abrir uma avaliação escolhida, e por isso diz DE QUANDO ela é e, se não for a mais recente, avisa e leva ao resultado atual.
 */
export default function StudentPerfilLutadorResultado() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const {
    data: assessment,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["boxing-profile-assessment", id],
    queryFn: () => getBoxingProfileAssessment(id!),
    enabled: !!id,
  });

  // Para saber se esta é a avaliação mais recente do aluno (o histórico traz aluno e professor juntos: filtra por tipo).
  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });
  const { data: history } = useQuery({
    queryKey: ["boxing-profile-history", studentId],
    queryFn: () => getBoxingProfileHistory(studentId!),
    enabled: !!studentId,
  });
  // Canal do aluno com o professor (mesmo da Home/Minha conta): sem número cadastrado, o botão não aparece.
  const { data: adminId } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });
  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-professor", adminId],
    queryFn: () => getWhatsappDoProfessor(adminId!),
    enabled: !!adminId,
    staleTime: 60 * 60 * 1000,
  });
  const maisRecente = history
    ?.filter((a) => a.assessmentType === "self")
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const antiga = !!assessment && !!maisRecente && assessment.id !== maisRecente.id;

  const subtitulo = assessment
    ? `${formatDateWithYear(assessment.completedAt)} · versão ${assessment.assessmentLength === "short" ? "rápida" : "completa"}`
    : undefined;

  return (
    <div className="page-container">
      <PageHeader title="RESULTADO" subtitle={subtitulo} back />

      {isError && (
        <ErrorState
          title="Não conseguimos abrir essa avaliação"
          description="Verifique sua conexão e tente novamente. Seus resultados continuam salvos."
          onRetry={() => refetch()}
        />
      )}
      {/* Esqueleto com a forma do resultado (cartão do estilo, secundário, botão, radar), não quatro blocos iguais; anunciado ao leitor de tela. */}
      {isLoading && !isError && (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Carregando o resultado…
          </p>
          <div aria-hidden>
            <SkeletonCard height={300} className="mb-4" />
            <SkeletonCard height={84} className="mb-5" />
            <SkeletonCard height={44} className="mb-5" />
            <SkeletonCard height={280} />
          </div>
        </div>
      )}
      {!isLoading && !isError && !assessment && (
        <EmptyState
          title="Avaliação não encontrada"
          description="Essa avaliação pode ter sido removida ou o link está incorreto."
          ctaLabel="Ver meu Perfil de Boxe"
          ctaVariant="secondary"
          onCta={() => navigate("/app/perfil-lutador")}
        />
      )}
      {!isLoading && !isError && assessment && antiga && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 mb-4">
          <p className="flex-1 text-[13.5px] text-muted-foreground leading-snug">
            Esta é uma avaliação antiga. Seu resultado atual pode ser diferente.
          </p>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => navigate("/app/perfil-lutador")}>
            Ver resultado atual
          </Button>
        </div>
      )}
      {!isLoading && !isError && assessment && <BoxingProfileResultView assessment={assessment} />}

      {/* Antes a tela terminava no aviso de autopercepção: depois de ler quase três telas o único botão era o de voltar. */}
      {!isLoading && !isError && assessment && (
        <div className="flex flex-col gap-2.5 mt-6">
          <Button size="lg" className="w-full" onClick={() => navigate("/app/perfil-lutador/historico")}>
            Ver minha evolução
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate("/app/perfil-lutador")}>
            Ir para o meu Perfil de Boxe
          </Button>
          {whatsapp && (
            <Button asChild variant="ghost" size="lg" className="w-full">
              <a
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Aqui é ${profile?.name.split(" ")[0] ?? ""}. Vi o resultado do meu Perfil de Boxe e queria conversar sobre ele.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Falar com o professor sobre isso
                <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
