import { useState, type ReactNode } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { BoxingRadarChart } from "@/components/BoxingRadarChart";
import { FighterProfileGloss } from "@/components/FighterProfileGloss";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILES, FIGHTER_PROFILE_LABELS, SCORING_VERSION } from "@/lib/boxingProfile";
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
  /** Aviso (ex.: "resultado parcial") — sempre logo abaixo do destaque, em todos os estados. */
  notice?: ReactNode;
}

/** Botão de mostrar/esconder: o detalhe fica recolhido para a página não virar uma parede de números. */
function Disclosure({ label, open, onToggle, controls }: { label: string; open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className="mb-5 flex w-full min-h-11 items-center justify-between rounded-xl border border-border px-4 text-[14px] font-semibold text-foreground active:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );
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
  radarHeading = "Seu radar",
  notice,
}: BoxingProfileScoresSummaryProps) {
  const { primaryProfile, secondaryProfile, dimensionScores, profileScores, assessmentLength, scoringVersion } = assessment;
  const isOldFormula = scoringVersion !== SCORING_VERSION;
  // Estilo predominante e secundário respondem "quem sou eu"; os outros 4 e as 8 notas são detalhe.
  const [showAllProfiles, setShowAllProfiles] = useState(false);
  const [showScores, setShowScores] = useState(false);

  return (
    <div>
      {(assessmentLength === "short" || isOldFormula) && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {assessmentLength === "short" && (
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground bg-secondary rounded-full px-2.5 py-1">
              Versão rápida
            </span>
          )}
          {isOldFormula && (
            <span className="text-xs font-bold uppercase tracking-wide text-amber bg-amber/10 rounded-full px-2.5 py-1">
              Calculado pela fórmula anterior
            </span>
          )}
        </div>
      )}
      <div className="rounded-[20px] p-5 mb-4 bg-[linear-gradient(150deg,hsl(var(--surface-amber-wash)),hsl(var(--surface-raised))_60%)] border border-amber/30">
        <div className="flex items-center gap-1.5 text-amber text-xs font-bold uppercase tracking-wide mb-2">
          <Trophy className="h-3.5 w-3.5" aria-hidden /> {heroLabel}
        </div>
        {/* Título de verdade (visualmente igual): o leitor de tela pulava o item mais importante da página — o nome do estilo era um <div>. */}
        <h2 className="font-display text-[28px] font-normal tracking-wide text-foreground leading-none mb-1">
          {FIGHTER_PROFILE_LABELS[primaryProfile]}
        </h2>
        <FighterProfileGloss profile={primaryProfile} className="text-[13.5px] text-foreground/70 mb-2" />
        <div className="text-accent text-[15px] font-semibold">{profileScores[primaryProfile]}% de afinidade com esse estilo</div>
        {/* "82%" lido sozinho parece uma nota. Não é: é o quanto as respostas se parecem com o estilo (texto neutro: vale para aluno e professor). */}
        <div className="text-xs text-muted-foreground mt-0.5 mb-3">Quanto as respostas se parecem com esse estilo. Não é uma nota.</div>
        {description && <p className="text-[13.5px] text-foreground/85 leading-relaxed">{description}</p>}
      </div>
      {notice}

      <div className="card-dark p-4 mb-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Perfil secundário</div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-foreground">{FIGHTER_PROFILE_LABELS[secondaryProfile]}</div>
            <FighterProfileGloss profile={secondaryProfile} />
          </div>
          <div className="text-[13px] text-accent font-semibold shrink-0">{profileScores[secondaryProfile]}% de afinidade</div>
        </div>
      </div>

      <Disclosure
        label={showAllProfiles ? "Esconder os outros perfis" : "Ver todos os perfis"}
        open={showAllProfiles}
        onToggle={() => setShowAllProfiles((v) => !v)}
        controls="perfis-distribuicao"
      />
      <div id="perfis-distribuicao" hidden={!showAllProfiles} className="card-dark p-4 mb-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">Distribuição completa</div>
        <div className="flex flex-col gap-2">
          {[...FIGHTER_PROFILES]
            .sort((a, b) => profileScores[b] - profileScores[a])
            .map((p) => (
              <div key={p} className="flex items-center gap-2.5">
                <span className="flex-1 min-w-0 text-[12.5px] text-foreground/80">
                  {FIGHTER_PROFILE_LABELS[p]}
                  <FighterProfileGloss profile={p} />
                </span>
                <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${profileScores[p]}%` }} />
                </div>
                <span className="w-9 text-right text-[12px] text-muted-foreground tabular-nums">{profileScores[p]}%</span>
              </div>
            ))}
        </div>
      </div>

      <h2 className="section-title mb-3">{radarHeading}</h2>
      <div className="card-dark p-4 mb-3.5 flex justify-center">
        <BoxingRadarChart scores={dimensionScores} />
      </div>
      {/* Representação textual — o radar é decorativo (aria-hidden), esta lista é a informação real;
          o botão acima dela é o que leitores de tela encontram no lugar do radar. */}
      <Disclosure
        label={showScores ? "Esconder as notas" : "Ver a nota de cada competência"}
        open={showScores}
        onToggle={() => setShowScores((v) => !v)}
        controls="notas-competencias"
      />
      <div id="notas-competencias" hidden={!showScores} className="card-dark p-4 mb-5">
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
