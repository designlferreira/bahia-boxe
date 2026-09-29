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
      {/* O aviso de autopercepção ficava no FIM da tela (a mais de 2.000px do estilo, em 12px). O risco de a pessoa não se reconhecer ou se sentir
          rotulada está logo depois de ler o nome do estilo — é ali que ele precisa estar, e em tom de convite. */}
      <BoxingProfileScoresSummary
        assessment={assessment}
        description={FIGHTER_PROFILE_DESCRIPTIONS[primaryProfile]}
        notice={
          <>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
              É como você se vê hoje, não uma avaliação técnica. Se não se reconheceu, converse com o seu professor: o resultado muda com você.
            </p>
            {notice}
          </>
        }
      />

      <BoxingProfileNextSteps primaryProfile={primaryProfile} dimensionScores={dimensionScores} />
    </div>
  );
}
