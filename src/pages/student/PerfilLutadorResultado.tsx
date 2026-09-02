import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { BoxingProfileResultView } from "@/components/BoxingProfileResultView";
import { getBoxingProfileAssessment } from "@/integrations/backend/api";

export default function StudentPerfilLutadorResultado() {
  const { id } = useParams<{ id: string }>();

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

  return (
    <div className="page-container">
      <PageHeader title="RESULTADO" back />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={4} height={110} />}
      {!isLoading && !isError && !assessment && (
        <EmptyState title="Avaliação não encontrada" description="Essa avaliação pode ter sido removida ou o link está incorreto." />
      )}
      {!isLoading && !isError && assessment && <BoxingProfileResultView assessment={assessment} />}
    </div>
  );
}
