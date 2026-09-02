import { Trophy } from "lucide-react";
import { BoxingRadarChart } from "@/components/BoxingRadarChart";
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  FIGHTER_PROFILES,
  FIGHTER_PROFILE_DESCRIPTIONS,
  FIGHTER_PROFILE_LABELS,
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

export function BoxingProfileResultView({ assessment }: BoxingProfileResultViewProps) {
  const { primaryProfile, secondaryProfile, dimensionScores, profileScores } = assessment;
  const strengths = topStrengths(dimensionScores, 3);
  const priorities = evolutionPriorities(dimensionScores, 3);
  const recommendation = getRecommendation({ primaryProfile, dimensionScores });

  return (
    <div>
      <div className="rounded-[20px] p-5 mb-4 bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-amber/30">
        <div className="flex items-center gap-1.5 text-amber text-[11px] font-bold uppercase tracking-wide mb-2">
          <Trophy className="h-3.5 w-3.5" /> Perfil predominante
        </div>
        <div className="font-display text-[28px] tracking-wide text-foreground leading-none mb-1">
          {FIGHTER_PROFILE_LABELS[primaryProfile]}
        </div>
        <div className="text-accent text-[15px] font-semibold mb-3">{profileScores[primaryProfile]}% de compatibilidade</div>
        <p className="text-[13.5px] text-foreground/85 leading-relaxed">{FIGHTER_PROFILE_DESCRIPTIONS[primaryProfile]}</p>
      </div>

      <div className="card-dark p-4 mb-5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Perfil secundário</div>
        <div className="flex items-baseline justify-between">
          <div className="text-[15px] font-semibold text-foreground">{FIGHTER_PROFILE_LABELS[secondaryProfile]}</div>
          <div className="text-[13px] text-accent font-semibold">{profileScores[secondaryProfile]}% de compatibilidade</div>
        </div>
      </div>

      <div className="card-dark p-4 mb-5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">Distribuição completa</div>
        <div className="flex flex-col gap-2">
          {[...FIGHTER_PROFILES]
            .sort((a, b) => profileScores[b] - profileScores[a])
            .map((p) => (
              <div key={p} className="flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] text-foreground/80">{FIGHTER_PROFILE_LABELS[p]}</span>
                <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${profileScores[p]}%` }} />
                </div>
                <span className="w-9 text-right text-[12px] text-muted-foreground tabular-nums">{profileScores[p]}%</span>
              </div>
            ))}
        </div>
      </div>

      <div className="font-display text-lg tracking-wide text-foreground mb-3">SEU RADAR</div>
      <div className="card-dark p-4 mb-3.5 flex justify-center">
        <BoxingRadarChart scores={dimensionScores} />
      </div>
      {/* Representação textual — o radar é decorativo (aria-hidden), esta lista é a informação real. */}
      <div className="card-dark p-4 mb-5">
        <div className="flex flex-col gap-2">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="flex items-center justify-between text-[13px]">
              <span className="text-foreground/80">{DIMENSION_LABELS[dim]}</span>
              <span className="font-semibold text-foreground tabular-nums">{dimensionScores[dim]}</span>
            </div>
          ))}
        </div>
      </div>

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
