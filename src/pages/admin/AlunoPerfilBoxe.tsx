import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BoxingProfileScoresSummary } from "@/components/BoxingProfileScoresSummary";
import { BoxingProfileComparisonView } from "@/components/BoxingProfileComparisonView";
import { getAdminStudentDetail, getBoxingProfileHistory } from "@/integrations/backend/api";

/** Mesmo limiar do fluxo do aluno — abaixo disso, reavaliar mostra um aviso (não bloqueante). */
const RECENT_ASSESSMENT_HOURS = 24;

export default function AdminAlunoPerfilBoxe() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [confirmRetake, setConfirmRetake] = useState(false);

  const { data: student } = useQuery({
    queryKey: ["admin-student-detail", studentId],
    queryFn: () => getAdminStudentDetail(studentId!),
    enabled: !!studentId,
  });

  const {
    data: history,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["boxing-profile-history", studentId],
    queryFn: () => getBoxingProfileHistory(studentId!),
    enabled: !!studentId,
  });

  const latestSelf = history?.find((a) => a.assessmentType === "self");
  const latestCoach = history?.find((a) => a.assessmentType === "coach");
  const isRecentCoach = latestCoach
    ? Date.now() - new Date(latestCoach.completedAt).getTime() < RECENT_ASSESSMENT_HOURS * 60 * 60 * 1000
    : false;

  function goToQuestionnaire() {
    navigate(`/admin/alunos/${studentId}/perfil-lutador/questionario`);
  }

  function handleEvaluateClick() {
    if (isRecentCoach) {
      setConfirmRetake(true);
      return;
    }
    goToQuestionnaire();
  }

  return (
    <div className="page-container">
      <PageHeader title="PERFIL DE BOXE" subtitle={student ? student.student.name : undefined} back />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={100} />}

      {!isLoading && !isError && !latestCoach && (
        <EmptyState
          icon={Sparkles}
          title="Você ainda não avaliou este aluno"
          description="Registre sua leitura técnica sobre o aluno nas mesmas 8 competências do Perfil de Boxe. Isso fica disponível pra comparar com a autoavaliação dele, quando ele tiver uma."
          ctaLabel="Avaliar como professor"
          onCta={goToQuestionnaire}
        />
      )}

      {!isLoading && !isError && latestCoach && latestSelf && (
        <BoxingProfileComparisonView self={latestSelf} coach={latestCoach} viewer="admin" />
      )}

      {!isLoading && !isError && latestCoach && !latestSelf && (
        <>
          <BoxingProfileScoresSummary assessment={latestCoach} heroLabel="Sua leitura sobre o aluno" radarHeading="RADAR" />
          <p className="text-[11.5px] text-muted-foreground leading-relaxed -mt-3 mb-5">
            O aluno ainda não fez a própria autoavaliação — quando ele fizer, a comparação aparece aqui automaticamente.
          </p>
        </>
      )}

      {!isLoading && !isError && latestCoach && (
        <Button variant="ghost" className="w-full" onClick={handleEvaluateClick}>
          Reavaliar
        </Button>
      )}

      <ConfirmDialog
        open={confirmRetake}
        onOpenChange={setConfirmRetake}
        title="REAVALIAR TÃO CEDO?"
        description="Você avaliou este aluno há pouco tempo. Reavaliar agora cria um novo registro no histórico — a avaliação anterior continua guardada normalmente."
        confirmLabel="Reavaliar mesmo assim"
        cancelLabel="Cancelar"
        onConfirm={goToQuestionnaire}
      />
    </div>
  );
}
