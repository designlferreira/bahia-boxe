import { DIMENSIONS, type Dimension } from "./dimensions";
import { FIGHTER_PROFILES, FIGHTER_PROFILE_WEIGHTS, type FighterProfileKey } from "./fighterProfiles";
import { rankProfiles, roundScores, likertScoreFromAverage, behavioralScoreRaw, type Answers } from "./scoring";
import { getQuestions } from "./questions";
import type { AssessmentType } from "./assessmentType";
import { FORCED_CHOICE_WEIGHT, type AssessmentLength } from "./assessmentLength";

/**
 * Só o formato que a combinação precisa — evita um ciclo de import (`integrations/backend/types.ts`
 * já importa `Dimension` daqui; se este arquivo importasse `BoxingProfileAssessment` de lá, fecharia
 * o ciclo). `BoxingProfileAssessment` (o tipo completo, com `answers`) satisfaz esta forma
 * estruturalmente — `BoxingProfileAssessmentSummary` (sem `answers`) NÃO satisfaz mais, de propósito:
 * é o que força quem chama a buscar o registro completo, não só o resumo leve da lista de histórico.
 */
export interface CombinableAssessment {
  assessmentType: AssessmentType;
  assessmentLength: AssessmentLength;
  dimensionScores: Record<Dimension, number>;
  profileScores: Record<FighterProfileKey, number>;
  answers: Answers;
}

/**
 * 1 ponto Likert de diferença média, expresso em pontos de score — derivado da própria fórmula de
 * conversão (`likertScoreFromAverage`), não um "25" solto. A inclinação é constante (25) e
 * independente de quantas perguntas cada dimensão tem (3 ou 4 no questionário atual): se a fórmula
 * de conversão mudar um dia, esta constante acompanha automaticamente (CLAUDE.md, "Resultado
 * combinado de Perfil de Boxe").
 */
const ONE_LIKERT_POINT_SCORE_DELTA = likertScoreFromAverage(2) - likertScoreFromAverage(1);

/**
 * Acima da média das 8 diferenças — desacordo espalhado, mesmo sem nenhuma dimensão isolada
 * estourar. Ponto de partida derivado da mecânica da escala, não de dados observados; revisar
 * quando houver avaliações duplas suficientes pra checar a frequência real de disparo (CLAUDE.md).
 */
const AGGREGATE_DIFF_THRESHOLD = 15;

export type MissingSide = "self" | "coach" | null;

export interface CombinedResult {
  dimensionScores: Record<Dimension, number>;
  profileScores: Record<FighterProfileKey, number>;
  rankedProfiles: FighterProfileKey[];
  primaryProfile: FighterProfileKey;
  secondaryProfile: FighterProfileKey;
  /** true quando só um dos dois lados existe — os scores acima são só desse lado, sem combinação real. */
  isPartial: boolean;
  missingSide: MissingSide;
  isDivergent: boolean;
  /** só preenchida quando o gatilho ISOLADO disparou (uma dimensão específica se destaca); null quando é só o agregado. */
  divergentDimension: Dimension | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function behavioralQuestionIdsFor(a: CombinableAssessment): string[] {
  return getQuestions(a.assessmentType, a.assessmentLength)
    .filter((q) => q.type === "behavioral")
    .map((q) => q.id);
}

/**
 * Combina autoavaliação + avaliação do professor numa leitura só. Dimensões primeiro: a média
 * acontece nas 8 competências (nunca média de arquétipos); a escolha forçada entra na mesma lógica
 * — cada lado tem seu próprio score de escolha forçada recalculado a partir das respostas brutas
 * (mesma fórmula de `computeProfileScoresRaw`, via `behavioralScoreRaw`), e os dois já vêm
 * normalizados 0-100 então se combinam pela média, igual às dimensões. O arquétipo final é derivado
 * dos dois combinados, nunca de um dos dois arquétipos individuais (CLAUDE.md, "Resultado
 * combinado" e "corrigindo a lacuna da escolha forçada").
 *
 * Deriva, não armazena — chamar de novo sempre que uma das duas mudar, mesmo padrão de
 * `calcular_saldo_pacote`.
 *
 * Se só um dos dois existir, retorna o `profileScores`/`dimensionScores` QUE JÁ EXISTEM naquela
 * avaliação, marcado `isPartial` — nada é recalculado (achado da revisão: a versão anterior
 * recalculava do zero só com peso de dimensão aqui, descartando o número certo, que já incluía a
 * escolha forçada daquela avaliação). Se nenhum existir, retorna `null`.
 */
export function combineAssessments(
  self: CombinableAssessment | undefined,
  coach: CombinableAssessment | undefined,
): CombinedResult | null {
  if (!self && !coach) return null;

  if (!self || !coach) {
    const only = (self ?? coach)!;
    const rankedProfiles = rankProfiles(only.profileScores, only.dimensionScores);
    return {
      dimensionScores: roundScores(only.dimensionScores),
      profileScores: roundScores(only.profileScores),
      rankedProfiles,
      primaryProfile: rankedProfiles[0],
      secondaryProfile: rankedProfiles[1],
      isPartial: true,
      missingSide: self ? "coach" : "self",
      isDivergent: false,
      divergentDimension: null,
    };
  }

  const dimensionScoresRaw = {} as Record<Dimension, number>;
  const diffs = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) {
    dimensionScoresRaw[dim] = (self.dimensionScores[dim] + coach.dimensionScores[dim]) / 2;
    diffs[dim] = Math.abs(self.dimensionScores[dim] - coach.dimensionScores[dim]);
  }

  const selfBehavioralIds = behavioralQuestionIdsFor(self);
  const coachBehavioralIds = behavioralQuestionIdsFor(coach);

  /**
   * Peso da escolha forçada usado na combinação: a média dos dois pesos de origem. Quando as duas
   * avaliações são da mesma variante (o caso comum), os dois pesos já são iguais e isso não muda
   * nada. Quando divergem (curta com professor, completa com aluno, por exemplo — já sinalizado
   * como "não diretamente comparável" na tela), não existe um peso "certo" pra combinar uma leitura
   * de 14 itens com uma de 37 — a média é convenção por ausência de razão melhor, não uma
   * calibração. Registrado assim no CLAUDE.md pra não parecer validado depois.
   */
  const forcedChoiceWeight = (FORCED_CHOICE_WEIGHT[self.assessmentLength] + FORCED_CHOICE_WEIGHT[coach.assessmentLength]) / 2;

  const profileScoresRaw = {} as Record<FighterProfileKey, number>;
  for (const profile of FIGHTER_PROFILES) {
    const weights = FIGHTER_PROFILE_WEIGHTS[profile];
    const dimensionScore = DIMENSIONS.reduce((acc, dim) => acc + dimensionScoresRaw[dim] * weights[dim], 0);
    const behavioralScore = (behavioralScoreRaw(self.answers, profile, selfBehavioralIds) + behavioralScoreRaw(coach.answers, profile, coachBehavioralIds)) / 2;
    const blended = (1 - forcedChoiceWeight) * dimensionScore + forcedChoiceWeight * behavioralScore;
    profileScoresRaw[profile] = clamp(blended, 0, 100);
  }

  const rankedProfiles = rankProfiles(profileScoresRaw, dimensionScoresRaw);

  let maxDiff = -Infinity;
  let maxDim: Dimension = DIMENSIONS[0];
  let sumDiff = 0;
  for (const dim of DIMENSIONS) {
    sumDiff += diffs[dim];
    if (diffs[dim] > maxDiff) {
      maxDiff = diffs[dim];
      maxDim = dim;
    }
  }
  const isDivergentIsolated = maxDiff > ONE_LIKERT_POINT_SCORE_DELTA;
  const isDivergentAggregate = sumDiff / DIMENSIONS.length > AGGREGATE_DIFF_THRESHOLD;

  return {
    dimensionScores: roundScores(dimensionScoresRaw),
    profileScores: roundScores(profileScoresRaw),
    rankedProfiles,
    primaryProfile: rankedProfiles[0],
    secondaryProfile: rankedProfiles[1],
    isPartial: false,
    missingSide: null,
    isDivergent: isDivergentIsolated || isDivergentAggregate,
    divergentDimension: isDivergentIsolated ? maxDim : null,
  };
}
