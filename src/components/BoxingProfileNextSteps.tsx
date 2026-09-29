import {
  DIMENSION_LABELS,
  PRIORITY_TEXT,
  STRENGTH_TEXT,
  evolutionPriorities,
  getRecommendation,
  topStrengths,
} from "@/lib/boxingProfile";
import type { Dimension, FighterProfileKey } from "@/lib/boxingProfile";

interface BoxingProfileNextStepsProps {
  primaryProfile: FighterProfileKey;
  dimensionScores: Record<Dimension, number>;
}

/**
 * "O que faço com isso?": pontos fortes, prioridades e no que focar — na voz do aluno. Usado no
 * resultado da autoavaliação (BoxingProfileResultView) e na tela com as duas avaliações, onde
 * alimenta-se do resultado COMBINADO (antes esses passos sumiam justamente no estado mais completo).
 */
export function BoxingProfileNextSteps({ primaryProfile, dimensionScores }: BoxingProfileNextStepsProps) {
  const strengths = topStrengths(dimensionScores, 3);
  const priorities = evolutionPriorities(dimensionScores, 3);
  const recommendation = getRecommendation({ primaryProfile, dimensionScores });

  return (
    <div>
      <h2 className="section-title mb-3">Seus pontos fortes</h2>
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

      <h2 className="section-title mb-3">Prioridades de evolução</h2>
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

      <h2 className="section-title mb-3">No que focar nos próximos treinos</h2>
      <div className="rounded-2xl p-4 bg-secondary/60 mb-5">
        <p className="text-[13.5px] text-foreground/85 leading-relaxed">{recommendation}</p>
      </div>
    </div>
  );
}
