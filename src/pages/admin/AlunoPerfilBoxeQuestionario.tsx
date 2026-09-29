import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BoxingProfileHeading, BoxingProfileQuestionnaire } from "@/components/BoxingProfileQuestionnaire";
import { PageHeader } from "@/components/PageHeader";
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

  // Antes `return null`: tela em branco, sem título, enquanto o perfil não chegava.
  if (!profile || !studentId) {
    return (
      <div className="page-container">
        <PageHeader title="PERFIL DE BOXE" />
        <SkeletonCard height={120} />
      </div>
    );
  }

  // O nome de quem está sendo avaliado fica SEMPRE visível (na escolha da versão E durante as perguntas): errar de aluno é um erro caro e silencioso.
  const quem = data ? `Avaliando ${data.student.name}` : <SkeletonCard height={16} className="w-44" />;

  return (
    <div className="page-container">
      {!length && <BoxingProfileHeading subtitle={quem} />}

      {!length ? (
        <BoxingProfileLengthChoice
          voz="coach"
          onChoose={setLength}
          questionCount={{ short: getQuestions("coach", "short").length, full: getQuestions("coach", "full").length }}
        />
      ) : (
        <BoxingProfileQuestionnaire
          heading={
            <BoxingProfileHeading
              subtitle={
                data ? (
                  <>
                    <strong className="font-semibold text-foreground">{data.student.name}</strong> · versão {length === "short" ? "rápida" : "completa"}
                  </>
                ) : (
                  quem
                )
              }
            />
          }
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
