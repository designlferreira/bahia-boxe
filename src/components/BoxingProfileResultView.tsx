import { BoxingProfileScoresSummary } from "@/components/BoxingProfileScoresSummary";
import {
  DIMENSION_LABELS,
  FIGHTER_PROFILE_DESCRIPTIONS,
  PRIORITY_TEXT,
  STRENGTH_TEXT,
  evolutionPriorities,
  getRecommendation,
  topStrengths,
} from "@/lib/boxingProfile";
import type { BoxingProfileAssessmentSummary } from "@/integrations/backend/types";

interface BoxingProfileResultViewProps {
  assessment: BoxingProfileAssessmentSummary;
}

/**
 * Resultado completo na voz do aluno — usado só nas telas onde quem lê é o próprio aluno sobre si
 * mesmo ("Suas respostas indicam...", "Seus pontos fortes..."). Pra contextos onde essa voz não
 * serve (professor lendo sobre o aluno, comparação Aluno×Professor), usar `BoxingProfileScoresSummary`
 * direto, sem a prosa de pontos fortes/prioridades/recomendação daqui.
 */
export function BoxingProfileResultView({ assessment }: BoxingProfileResultViewProps) {
  const { primaryProfile, dimensionScores } = assessment;
  const strengths = topStrengths(dimensionScores, 3);
  const priorities = evolutionPriorities(dimensionScores, 3);
  const recommendation = getRecommendation({ primaryProfile, dimensionScores });

  return (
    <div>
      <BoxingProfileScoresSummary assessment={assessment} description={FIGHTER_PROFILE_DESCRIPTIONS[primaryProfile]} />

      <div className="font-display text-lg tracking-wide text-foreground mb-3">SEUS PONTOS FORTES</div>
      <div className="flex flex-col gap-2.5 mb-5">
        {strengths.map((dim) => (
          <div key={dim} className="card-dark p-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[14.5px] font-semibold text-foreground">{DIMENSION_LABELS[dim]}</span>
              <span className="text-accent font-semibold tabular-nums">{dimensionScores[dim]}</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">{STRENGTH_TEXT[dim]}</p>
          </div>
        ))}
      </div>

      <div className="font-display text-lg tracking-wide text-foreground mb-3">PRIORIDADES DE EVOLUÇÃO</div>
      <div className="flex flex-col gap-2.5 mb-5">
        {priorities.map((dim) => (
          <div key={dim} className="card-dark p-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[14.5px] font-semibold text-foreground">{DIMENSION_LABELS[dim]}</span>
              <span className="text-muted-foreground font-semibold tabular-nums">{dimensionScores[dim]}</span>
            </div>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">{PRIORITY_TEXT[dim]}</p>
          </div>
        ))}
      </div>

      <div className="font-display text-lg tracking-wide text-foreground mb-3">NO QUE FOCAR NOS PRÓXIMOS TREINOS</div>
      <div className="rounded-2xl p-4 bg-secondary/60 mb-2">
        <p className="text-[13.5px] text-foreground/85 leading-relaxed">{recommendation}</p>
      </div>
      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
        Este resultado representa sua autopercepção no momento da avaliação — não substitui a avaliação técnica do seu treinador.
      </p>
    </div>
  );
}
