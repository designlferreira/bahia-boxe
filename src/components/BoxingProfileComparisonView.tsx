import { BoxingRadarChart } from "@/components/BoxingRadarChart";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILE_LABELS } from "@/lib/boxingProfile";
import type { BoxingProfileAssessmentSummary } from "@/integrations/backend/types";

interface BoxingProfileComparisonViewProps {
  self: BoxingProfileAssessmentSummary;
  coach: BoxingProfileAssessmentSummary;
  /** Quem está lendo — só muda os rótulos/o texto de apoio, nunca os números. */
  viewer: "student" | "admin";
}

const VIEWER_COPY: Record<
  "student" | "admin",
  {
    selfLabel: string;
    selfColumn: string;
    coachLabel: string;
    coachColumn: string;
    intro: string;
    agree: string;
    differ: string;
    disclaimer: string;
  }
> = {
  student: {
    selfLabel: "Sua autoavaliação",
    selfColumn: "Você",
    coachLabel: "Avaliação do seu professor",
    coachColumn: "Prof.",
    intro: "Duas leituras sobre o mesmo momento: como você se percebe e como seu professor observa você tecnicamente.",
    agree: "Você e seu professor enxergam o mesmo perfil predominante.",
    differ: "Você e seu professor enxergam perfis predominantes diferentes — isso é normal e pode ser um bom tema pra conversar no treino.",
    disclaimer: "Nenhuma das duas leituras anula a outra: uma é autopercepção, a outra é observação técnica externa.",
  },
  admin: {
    selfLabel: "Autoavaliação do aluno",
    selfColumn: "Aluno",
    coachLabel: "Sua avaliação como professor",
    coachColumn: "Você",
    intro: "Compare a autopercepção do aluno com a sua leitura técnica sobre ele.",
    agree: "O aluno e você enxergam o mesmo perfil predominante.",
    differ: "O aluno e você enxergam perfis predominantes diferentes — pode valer a pena conversar sobre isso no próximo treino.",
    disclaimer: "Divergências entre as duas leituras são esperadas: uma é autopercepção do aluno, a outra é sua observação técnica.",
  },
};

/**
 * Comparação Aluno×Professor lado a lado — sempre neutra, nunca "quem está certo". Só monta
 * quando as duas avaliações existem; quem chama decide o que mostrar se faltar uma das duas.
 */
export function BoxingProfileComparisonView({ self, coach, viewer }: BoxingProfileComparisonViewProps) {
  const copy = VIEWER_COPY[viewer];
  const samePrimaryProfile = self.primaryProfile === coach.primaryProfile;

  return (
    <div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">{copy.intro}</p>

      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div className="card-dark p-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">{copy.selfLabel}</div>
          <div className="text-[14px] font-semibold text-foreground leading-snug">{FIGHTER_PROFILE_LABELS[self.primaryProfile]}</div>
          <div className="text-[12px] text-accent font-semibold mt-0.5">{self.profileScores[self.primaryProfile]}%</div>
        </div>
        <div className="card-dark p-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">{copy.coachLabel}</div>
          <div className="text-[14px] font-semibold text-foreground leading-snug">{FIGHTER_PROFILE_LABELS[coach.primaryProfile]}</div>
          <div className="text-[12px] text-accent font-semibold mt-0.5">{coach.profileScores[coach.primaryProfile]}%</div>
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground leading-relaxed mb-5">{samePrimaryProfile ? copy.agree : copy.differ}</p>

      <div className="card-dark p-4 mb-2 flex flex-col items-center">
        <BoxingRadarChart scores={self.dimensionScores} compareScores={coach.dimensionScores} />
        <div className="flex items-center gap-4 mt-1">
          <span className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <span className="h-2 w-2 rounded-full bg-accent" /> {copy.selfLabel}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <span className="h-2 w-2 rounded-full border border-dashed border-muted-foreground" /> {copy.coachLabel}
          </span>
        </div>
      </div>

      <div className="card-dark p-4 mb-5">
        <div className="flex items-center text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">
          <span className="flex-1">Dimensão</span>
          <span className="w-12 text-right">{copy.selfColumn}</span>
          <span className="w-12 text-right">{copy.coachColumn}</span>
        </div>
        <div className="flex flex-col gap-2">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="flex items-center text-[13px]">
              <span className="flex-1 text-foreground/80">{DIMENSION_LABELS[dim]}</span>
              <span className="w-12 text-right font-semibold text-foreground tabular-nums">{self.dimensionScores[dim]}</span>
              <span className="w-12 text-right font-semibold text-muted-foreground tabular-nums">{coach.dimensionScores[dim]}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11.5px] text-muted-foreground leading-relaxed">{copy.disclaimer}</p>
    </div>
  );
}
