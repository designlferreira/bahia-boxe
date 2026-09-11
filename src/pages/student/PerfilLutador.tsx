import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BoxingProfileResultView } from "@/components/BoxingProfileResultView";
import { BoxingProfileScoresSummary } from "@/components/BoxingProfileScoresSummary";
import { BoxingProfileComparisonView } from "@/components/BoxingProfileComparisonView";
import { BoxingProfilePartialNotice } from "@/components/BoxingProfilePartialNotice";
import { getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

/** Abaixo disso, refazer o teste mostra um aviso (não bloqueante) antes de seguir. */
const RECENT_ASSESSMENT_HOURS = 24;

export default function StudentPerfilLutador() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [confirmRetake, setConfirmRetake] = useState(false);

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
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

  // `history` traz 'self' e 'coach' juntos (RLS por posse, não por tipo) — filtra por tipo em vez
  // de assumir a linha mais recente.
  const latest = history?.find((a) => a.assessmentType === "self");
  const latestCoach = history?.find((a) => a.assessmentType === "coach");
  const isRecent = latest
    ? Date.now() - new Date(latest.completedAt).getTime() < RECENT_ASSESSMENT_HOURS * 60 * 60 * 1000
    : false;

  function goToQuestionnaire() {
    navigate("/app/perfil-lutador/questionario");
  }

  function handleRetakeClick() {
    if (isRecent) {
      setConfirmRetake(true);
      return;
    }
    goToQuestionnaire();
  }

  return (
    <div className="page-container">
      <PageHeader title="PERFIL DE BOXE" back />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={100} />}

      {!isLoading && !isError && !latest && !latestCoach && (
        <>
          <EmptyState
            icon={Sparkles}
            title="Descubra seu Perfil de Boxe"
            description="Responda 32 perguntas rápidas sobre como você se enxerga dentro do ringue e descubra qual estilo de luta mais combina com o seu jeito de lutar."
            ctaLabel="Descobrir meu perfil"
            onCta={goToQuestionnaire}
          />
          <p className="text-[11.5px] text-muted-foreground text-center leading-relaxed mt-3">
            É uma autoavaliação: reflete como você percebe o seu próprio jogo no momento, não uma medição técnica feita pelo seu
            treinador.
          </p>
        </>
      )}

      {/* Professor já avaliou, mas o aluno ainda não fez a própria — mesmo par de telas do lado
          admin (AlunoPerfilBoxe.tsx), espelhado aqui: mostra a leitura do professor sozinha (nada
          pra comparar ainda) em vez de escondê-la atrás de um botão. */}
      {!isLoading && !isError && !latest && latestCoach && (
        <>
          <BoxingProfileScoresSummary assessment={latestCoach} heroLabel="Leitura do seu professor" radarHeading="RADAR" />
          <BoxingProfilePartialNotice text="Por enquanto, este resultado usa só a avaliação do seu professor. Assim que você fizer sua autoavaliação, o combinado passa a considerar as duas leituras." />
          <Button className="w-full" onClick={goToQuestionnaire}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Descobrir meu perfil
          </Button>
        </>
      )}

      {/* As duas existem: comparação INLINE, igual já acontecia no lado do professor
          (AlunoPerfilBoxe.tsx) — antes disso ficava atrás de um botão secundário fácil de não
          notar, e nada avisava que a avaliação do professor existia (CLAUDE.md, "aluno descobre a
          avaliação do professor"). */}
      {!isLoading && !isError && latest && latestCoach && <BoxingProfileComparisonView self={latest} coach={latestCoach} viewer="student" />}

      {!isLoading && !isError && latest && !latestCoach && (
        <>
          <BoxingProfilePartialNotice text="Por enquanto, este resultado usa só a sua autoavaliação. Assim que seu professor avaliar você, o combinado passa a considerar as duas leituras." />
          <BoxingProfileResultView assessment={latest} />
        </>
      )}

      {!isLoading && !isError && latest && (
        <div className="flex flex-col gap-2.5 mt-5">
          <Button variant="secondary" className="w-full" onClick={() => navigate("/app/perfil-lutador/historico")}>
            <TrendingUp className="h-4 w-4 mr-1.5" /> Minha evolução
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleRetakeClick}>
            Refazer avaliação
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmRetake}
        onOpenChange={setConfirmRetake}
        title="REFAZER TÃO CEDO?"
        description="Você fez essa autoavaliação há pouco tempo. Refazer agora cria um novo registro no seu histórico — a avaliação anterior continua guardada normalmente."
        confirmLabel="Refazer mesmo assim"
        cancelLabel="Cancelar"
        onConfirm={goToQuestionnaire}
      />
    </div>
  );
}
