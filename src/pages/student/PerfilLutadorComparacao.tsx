import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { BoxingProfileComparisonView } from "@/components/BoxingProfileComparisonView";
import { getBoxingProfileAssessment, getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

export default function StudentPerfilLutadorComparacao() {
  const { profile } = useAuth();

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

  const latestSelf = history?.find((a) => a.assessmentType === "self");
  const latestCoach = history?.find((a) => a.assessmentType === "coach");

  // A comparação precisa dos registros COMPLETOS (com `answers`) — ver mesmo comentário em
  // PerfilLutador.tsx/AlunoPerfilBoxe.tsx.
  const bothExist = !!latestSelf && !!latestCoach;
  const selfFullQuery = useQuery({
    queryKey: ["boxing-profile-assessment", latestSelf?.id],
    queryFn: () => getBoxingProfileAssessment(latestSelf!.id),
    enabled: bothExist,
  });
  const coachFullQuery = useQuery({
    queryKey: ["boxing-profile-assessment", latestCoach?.id],
    queryFn: () => getBoxingProfileAssessment(latestCoach!.id),
    enabled: bothExist,
  });
  const comparisonLoading = bothExist && (selfFullQuery.isLoading || coachFullQuery.isLoading);
  const comparisonError = bothExist && (selfFullQuery.isError || coachFullQuery.isError);

  return (
    <div className="page-container">
      <PageHeader title="VOCÊ × PROFESSOR" back />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={100} />}

      {!isLoading && !isError && (!latestSelf || !latestCoach) && (
        <EmptyState
          icon={Users}
          title="Comparação ainda não disponível"
          description={
            !latestCoach
              ? "Seu professor ainda não fez uma avaliação técnica sua. Assim que ele fizer, a comparação aparece aqui."
              : "Você ainda não fez sua autoavaliação. Faça-a pra poder comparar com a leitura do seu professor."
          }
        />
      )}

      {!isLoading && !isError && bothExist && comparisonLoading && <SkeletonList count={3} height={110} />}
      {!isLoading && !isError && bothExist && comparisonError && (
        <ErrorState
          onRetry={() => {
            selfFullQuery.refetch();
            coachFullQuery.refetch();
          }}
        />
      )}
      {!isLoading && !isError && bothExist && selfFullQuery.data && coachFullQuery.data && (
        <BoxingProfileComparisonView self={selfFullQuery.data} coach={coachFullQuery.data} viewer="student" />
      )}
    </div>
  );
}
