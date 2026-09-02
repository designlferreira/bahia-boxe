import { Trophy } from "lucide-react";
import { BoxingRadarChart } from "@/components/BoxingRadarChart";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILES, FIGHTER_PROFILE_LABELS } from "@/lib/boxingProfile";
import type { BoxingProfileAssessmentSummary } from "@/integrations/backend/types";

interface BoxingProfileScoresSummaryProps {
  assessment: BoxingProfileAssessmentSummary;
  heroLabel?: string;
  /**
   * Texto de apoio sob o perfil principal. Opcional e propositalmente sem padrão de conteúdo:
   * `FIGHTER_PROFILE_DESCRIPTIONS` é escrito na voz "seu perfil..." (2ª pessoa), então só faz
   * sentido quando quem lê é o próprio aluno — quem chama decide se passa isso ou não.
   */
  description?: string;
  radarHeading?: string;
}

/**
 * Bloco numérico/neutro de um resultado (perfil principal, secundário, distribuição dos 6,
 * radar + lista textual) — sem nenhuma prosa de "pontos fortes"/"prioridades"/recomendação, que
 * é sempre escrita na voz do aluno (`BoxingProfileResultView`). Existe pra ser reaproveitado em
 * contextos onde essa voz não se aplica: a tela do professor e a comparação Aluno×Professor.
 */
export function BoxingProfileScoresSummary({
  assessment,
  heroLabel = "Perfil predominante",
  description,
  radarHeading = "SEU RADAR",
}: BoxingProfileScoresSummaryProps) {
  const { primaryProfile, secondaryProfile, dimensionScores, profileScores } = assessment;

  return (
    <div>
      <div className="rounded-[20px] p-5 mb-4 bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-amber/30">
        <div className="flex items-center gap-1.5 text-amber text-[11px] font-bold uppercase tracking-wide mb-2">
          <Trophy className="h-3.5 w-3.5" /> {heroLabel}
        </div>
        <div className="font-display text-[28px] tracking-wide text-foreground leading-none mb-1">
          {FIGHTER_PROFILE_LABELS[primaryProfile]}
        </div>
        <div className="text-accent text-[15px] font-semibold mb-3">{profileScores[primaryProfile]}% de compatibilidade</div>
        {description && <p className="text-[13.5px] text-foreground/85 leading-relaxed">{description}</p>}
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

      <div className="font-display text-lg tracking-wide text-foreground mb-3">{radarHeading}</div>
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
    </div>
  );
}
