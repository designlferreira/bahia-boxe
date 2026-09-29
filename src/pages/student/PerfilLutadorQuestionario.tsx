import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { BoxingProfileHeading, BoxingProfileQuestionnaire } from "@/components/BoxingProfileQuestionnaire";
import { SkeletonCard } from "@/components/SkeletonCard";
import { BoxingProfileLengthChoice } from "@/components/BoxingProfileLengthChoice";
import { getQuestions, type AssessmentLength } from "@/lib/boxingProfile";
import { studentIdForProfile, submitBoxingProfileAssessment } from "@/integrations/backend/api";

export default function StudentPerfilLutadorQuestionario() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [length, setLength] = useState<AssessmentLength | null>(null);

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  // Antes `return null`: tela em branco, sem título, enquanto o perfil não chegava.
  if (!profile) {
    return (
      <div className="page-container">
        <PageHeader title="PERFIL DE BOXE" back />
        <SkeletonCard height={120} />
      </div>
    );
  }

  if (!length) {
    return (
      <div className="page-container">
        <PageHeader title="PERFIL DE BOXE" back />
        <BoxingProfileLengthChoice
          voz="self"
          onOpenDadosFisicos={() => navigate("/app/minha-conta/perfil")}
          onChoose={setLength}
          questionCount={{ short: getQuestions("self", "short").length, full: getQuestions("self", "full").length }}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <BoxingProfileQuestionnaire
        heading={<BoxingProfileHeading subtitle={`Sua autoavaliação · ${length === "short" ? "versão rápida" : "versão completa"}`} />}
        questions={getQuestions("self", length)}
        draftKey={`bb.boxing-profile-draft.self.${profile.id}.${length}`}
        onSubmit={(answers) => submitBoxingProfileAssessment(studentId!, answers, length)}
        onSuccess={(assessment) => navigate(`/app/perfil-lutador/resultado/${assessment.id}`, { replace: true })}
        onExit={() => navigate("/app/perfil-lutador")}
      />
    </div>
  );
}
