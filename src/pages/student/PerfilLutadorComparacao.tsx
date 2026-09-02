import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { BoxingProfileComparisonView } from "@/components/BoxingProfileComparisonView";
import { getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

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

      {!isLoading && !isError && latestSelf && latestCoach && (
        <BoxingProfileComparisonView self={latestSelf} coach={latestCoach} viewer="student" />
      )}
    </div>
  );
}
