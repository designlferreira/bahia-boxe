import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BoxingProfileQuestionnaire } from "@/components/BoxingProfileQuestionnaire";
import { SkeletonCard } from "@/components/SkeletonCard";
import { COACH_QUESTIONS } from "@/lib/boxingProfile";
import { getAdminStudentDetail, submitCoachBoxingProfileAssessment } from "@/integrations/backend/api";

export default function AdminAlunoPerfilBoxeQuestionario() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["admin-student-detail", studentId],
    queryFn: () => getAdminStudentDetail(studentId!),
    enabled: !!studentId,
  });

  if (!profile || !studentId) return null;

  return (
    <div className="page-container">
      {data ? (
        <div className="text-[12.5px] text-muted-foreground mb-1">Avaliando {data.student.name}</div>
      ) : (
        <SkeletonCard height={14} className="mb-2 w-40" />
      )}

      <BoxingProfileQuestionnaire
        questions={COACH_QUESTIONS}
        draftKey={`bb.boxing-profile-draft.coach.${profile.id}.${studentId}`}
        onSubmit={(answers) => submitCoachBoxingProfileAssessment(studentId, profile.id, answers)}
        onSuccess={() => navigate(`/admin/alunos/${studentId}/perfil-lutador`, { replace: true })}
        onExit={() => navigate(`/admin/alunos/${studentId}/perfil-lutador`)}
        exitDescription="Suas respostas ficam salvas neste dispositivo — você pode continuar de onde parou depois."
      />
    </div>
  );
}
