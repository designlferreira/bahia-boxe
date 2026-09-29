import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { BoxingProfileResultView } from "@/components/BoxingProfileResultView";
import { formatDateWithYear } from "@/lib/dateUtils";
import { getBoxingProfileAssessment, getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

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

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={4} height={110} />}
      {!isLoading && !isError && !assessment && (
        <EmptyState title="Avaliação não encontrada" description="Essa avaliação pode ter sido removida ou o link está incorreto." />
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
    </div>
  );
}
