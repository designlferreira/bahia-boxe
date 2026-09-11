import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BoxingProfileQuestionnaire } from "@/components/BoxingProfileQuestionnaire";
import { BoxingProfileLengthChoice } from "@/components/BoxingProfileLengthChoice";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getQuestions, type AssessmentLength } from "@/lib/boxingProfile";
import { getAdminStudentDetail, submitCoachBoxingProfileAssessment } from "@/integrations/backend/api";

export default function AdminAlunoPerfilBoxeQuestionario() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [length, setLength] = useState<AssessmentLength | null>(null);

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

      {!length ? (
        <BoxingProfileLengthChoice
          onChoose={setLength}
          questionCount={{ short: getQuestions("coach", "short").length, full: getQuestions("coach", "full").length }}
        />
      ) : (
        <BoxingProfileQuestionnaire
          questions={getQuestions("coach", length)}
          draftKey={`bb.boxing-profile-draft.coach.${profile.id}.${studentId}.${length}`}
          onSubmit={(answers) => submitCoachBoxingProfileAssessment(studentId, profile.id, answers, length)}
          onSuccess={() => navigate(`/admin/alunos/${studentId}/perfil-lutador`, { replace: true })}
          onExit={() => navigate(`/admin/alunos/${studentId}/perfil-lutador`)}
          exitDescription="Suas respostas ficam salvas neste dispositivo — você pode continuar de onde parou depois."
        />
      )}
    </div>
  );
}
