import { MessageCircle, Trophy } from "lucide-react";
import { BoxingProfileNextSteps } from "@/components/BoxingProfileNextSteps";
import { BoxingRadarChart } from "@/components/BoxingRadarChart";
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  FIGHTER_PROFILE_DESCRIPTIONS,
  FIGHTER_PROFILE_LABELS,
  combineAssessments,
} from "@/lib/boxingProfile";
import type { BoxingProfileAssessment } from "@/integrations/backend/types";

interface BoxingProfileComparisonViewProps {
  /**
   * O registro COMPLETO (com `answers`), não o resumo leve de `getBoxingProfileHistory` —
   * `combineAssessments` precisa das respostas brutas pra recompor o score de escolha forçada de
   * cada lado (CLAUDE.md, "corrigindo a lacuna da escolha forçada"). Quem chama busca os dois via
   * `getBoxingProfileAssessment(id)` antes de montar este componente.
   */
  self: BoxingProfileAssessment;
  coach: BoxingProfileAssessment;
  /** Quem está lendo — só muda os rótulos/o texto de apoio, nunca os números. */
  viewer: "student" | "admin";
  /**
   * Só o aluno: mostra "pontos fortes / prioridades / foco" calculados sobre o resultado COMBINADO
   * (o professor lê sobre o aluno; a voz desses textos é do aluno).
   */
  showNextSteps?: boolean;
  /** Link do WhatsApp do professor; aparece quando as leituras divergem. Sem número, sem link. */
  talkToCoachHref?: string | null;
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
 * Aviso de divergência — viewer-simétrico de propósito: "as leituras se distanciam" trata o
 * desacordo como propriedade da comparação, não erro de alguém, então o mesmo texto serve pro
 * aluno lendo sobre si e pro professor lendo sobre o aluno. Sem "desta vez": isso sugeriria que
 * existe um histórico comparável de referência, o que não é verdade na primeira avaliação dupla.
 */
function divergenceText(dim: string | null): string {
  const scope = dim ? ` em ${dim}` : "";
  return `As duas leituras se distanciam mais do que o normal${scope}. Não significa que uma esteja certa e a outra errada — são ângulos diferentes sobre o mesmo momento. Pode valer a pena conversar sobre isso no próximo treino.`;
}

/**
 * Comparação Aluno×Professor lado a lado — sempre neutra, nunca "quem está certo". Só monta
 * quando as duas avaliações existem; quem chama decide o que mostrar se faltar uma das duas.
 */
export function BoxingProfileComparisonView({ self, coach, viewer, showNextSteps = false, talkToCoachHref }: BoxingProfileComparisonViewProps) {
  const copy = VIEWER_COPY[viewer];
  const samePrimaryProfile = self.primaryProfile === coach.primaryProfile;
  // Nunca null aqui: as duas avaliações sempre existem quando este componente é montado.
  const combined = combineAssessments(self, coach)!;

  // CLAUDE.md, "Compatibilidade entre curta e completa" — curta tem 1 pergunta por dimensão em vez
  // de 3-4, e uma fórmula diferente não é a mesma régua: nos dois casos os números abaixo (inclusive
  // o combinado) não são diretamente comparáveis entre si, mesmo continuando a mostrá-los.
  const lengthMismatch = self.assessmentLength !== coach.assessmentLength;
  const versionMismatch = self.scoringVersion !== coach.scoringVersion;

  return (
    <div>
      {(lengthMismatch || versionMismatch) && (
        <p className="text-[11.5px] text-amber leading-relaxed mb-4 bg-amber/10 rounded-xl px-3.5 py-2.5">
          {lengthMismatch
            ? "Essas duas avaliações usam versões diferentes do questionário (rápida e completa) — os números abaixo não são diretamente comparáveis."
            : "Essas duas avaliações foram calculadas por versões diferentes da fórmula — os números abaixo não são diretamente comparáveis."}
        </p>
      )}
      {/* O resultado que a tela promete vem PRIMEIRO; as duas leituras que o formam ficam logo abaixo,
          e radar/tabela como detalhe (antes o combinado era o último bloco, a ~75% da página). */}
      <div className="rounded-[20px] p-5 mb-3 bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-amber/30">
        <div className="flex items-center gap-1.5 text-amber text-[11px] font-bold uppercase tracking-wide mb-2">
          <Trophy className="h-3.5 w-3.5" aria-hidden /> Resultado combinado
        </div>
        <div className="font-display text-[28px] tracking-wide text-foreground leading-none mb-1">
          {FIGHTER_PROFILE_LABELS[combined.primaryProfile]}
        </div>
        <div className="text-accent text-[15px] font-semibold mb-3">{combined.profileScores[combined.primaryProfile]}% de compatibilidade</div>
        {viewer === "student" && (
          <p className="text-[13.5px] text-foreground/85 leading-relaxed mb-2.5">{FIGHTER_PROFILE_DESCRIPTIONS[combined.primaryProfile]}</p>
        )}
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          Vem da média das duas leituras, competência por competência.
        </p>
      </div>

      {combined.isDivergent && (
        <p className="text-[11.5px] text-amber leading-relaxed mb-4">
          {divergenceText(combined.divergentDimension ? DIMENSION_LABELS[combined.divergentDimension] : null)}
        </p>
      )}

      <h2 className="section-title mb-2.5 mt-5">As duas leituras</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{copy.intro}</p>

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

      {viewer === "student" && talkToCoachHref && (!samePrimaryProfile || combined.isDivergent) && (
        <a
          href={talkToCoachHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-border p-4 active:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="h-5 w-5 text-foreground/85 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-foreground">Conversar com o professor</div>
            <div className="text-sm text-muted-foreground">Abre uma conversa no WhatsApp</div>
          </div>
        </a>
      )}

      {showNextSteps && viewer === "student" && (
        <BoxingProfileNextSteps primaryProfile={combined.primaryProfile} dimensionScores={combined.dimensionScores} />
      )}

      <h2 className="section-title mb-2.5">Competências</h2>
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
          <span className="w-11 text-right">{copy.selfColumn}</span>
          <span className="w-11 text-right">{copy.coachColumn}</span>
          <span className="w-11 text-right">Combin.</span>
        </div>
        <div className="flex flex-col gap-2">
          {DIMENSIONS.map((dim) => (
            <div key={dim} className="flex items-center text-[13px]">
              <span className="flex-1 text-foreground/80">{DIMENSION_LABELS[dim]}</span>
              <span className="w-11 text-right font-semibold text-foreground tabular-nums">{self.dimensionScores[dim]}</span>
              <span className="w-11 text-right font-semibold text-muted-foreground tabular-nums">{coach.dimensionScores[dim]}</span>
              <span className="w-11 text-right font-semibold text-accent tabular-nums">{combined.dimensionScores[dim]}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11.5px] text-muted-foreground leading-relaxed">{copy.disclaimer}</p>
    </div>
  );
}
