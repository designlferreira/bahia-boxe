import { BoxingProfileScoresSummary } from "@/components/BoxingProfileScoresSummary";
import type { ReactNode } from "react";
import { BoxingProfileNextSteps } from "@/components/BoxingProfileNextSteps";
import { FIGHTER_PROFILE_DESCRIPTIONS } from "@/lib/boxingProfile";
import type { BoxingProfileAssessmentSummary } from "@/integrations/backend/types";

interface BoxingProfileResultViewProps {
  assessment: BoxingProfileAssessmentSummary;
  notice?: ReactNode;
}

/**
 * Resultado completo na voz do aluno — usado só nas telas onde quem lê é o próprio aluno sobre si
 * mesmo ("Suas respostas indicam...", "Seus pontos fortes..."). Pra contextos onde essa voz não
 * serve (professor lendo sobre o aluno, comparação Aluno×Professor), usar `BoxingProfileScoresSummary`
 * direto, sem a prosa de pontos fortes/prioridades/recomendação daqui.
 */
export function BoxingProfileResultView({ assessment, notice }: BoxingProfileResultViewProps) {
  const { primaryProfile, dimensionScores } = assessment;
  return (
    <div>
      <BoxingProfileScoresSummary assessment={assessment} description={FIGHTER_PROFILE_DESCRIPTIONS[primaryProfile]} notice={notice} />

      <BoxingProfileNextSteps primaryProfile={primaryProfile} dimensionScores={dimensionScores} />
      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
        Este resultado representa sua autopercepção no momento da avaliação — não substitui a avaliação técnica do seu treinador.
      </p>
    </div>
  );
}
