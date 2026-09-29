import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
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

  // O envio precisa do id do aluno (antes `studentId!`: se a consulta ainda não tinha voltado, o "Enviar" quebrava). Espera com esqueleto.
  if (!studentId) {
    return (
      <div className="page-container">
        <PageHeader title="PERFIL DE BOXE" back />
        <SkeletonCard height={120} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <BoxingProfileQuestionnaire
        heading={<BoxingProfileHeading subtitle={`Sua autoavaliação · ${length === "short" ? "versão rápida" : "versão completa"}`} />}
        questions={getQuestions("self", length)}
        draftKey={`bb.boxing-profile-draft.self.${profile.id}.${length}`}
        onSubmit={(answers) => submitBoxingProfileAssessment(studentId, answers, length)}
        // Depois de enviar, o aluno vai para o Perfil de Boxe (que já mostra o resultado mais recente, o combinado com o professor, o selo de
        // parcial e os botões) com um aviso de "enviada". Antes caía numa tela "RESULTADO" sem nenhuma confirmação de envio e sem essas camadas.
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["boxing-profile-history"] });
          navigate("/app/perfil-lutador", { replace: true, state: { avaliacaoEnviada: true } });
        }}
        onExit={() => navigate("/app/perfil-lutador")}
      />
    </div>
  );
}
