import { DIMENSIONS, type Dimension } from "./dimensions";
import { LIKERT_QUESTIONS, BEHAVIORAL_QUESTIONS, QUESTIONS } from "./questions";
import { FIGHTER_PROFILES, FIGHTER_PROFILE_WEIGHTS, BEHAVIORAL_WEIGHTS, PROFILE_TIEBREAK_PRIORITY, type FighterProfileKey } from "./fighterProfiles";

export type BehavioralValue = "A" | "B" | "C" | "D";
/** `answers.q1` = 1-5 (Likert), `answers.q30` = "A"|"B"|"C"|"D". */
export type Answers = Record<string, number | BehavioralValue>;

export function missingQuestionIds(answers: Answers): string[] {
  return QUESTIONS.filter((q) => answers[q.id] === undefined || answers[q.id] === null).map((q) => q.id);
}

export function isComplete(answers: Answers): boolean {
  return missingQuestionIds(answers).length === 0;
}

/**
 * score = ((average - 1) / 4) * 100 — média 1→0, média 3→50, média 5→100, média 4.2→80.
 * Exportada (não só usada internamente) porque nenhuma dimensão do questionário atual tem um
 * número de questões que produza média 4.2 exata a partir de respostas inteiras 1-5 (todas têm 3
 * ou 4 questões) — o caso de teste obrigatório da especificação só é alcançável testando a
 * fórmula isolada, não através de `computeDimensionScores`.
 */
export function likertScoreFromAverage(average: number): number {
  return ((average - 1) / 4) * 100;
}

/**
 * Score bruto (0-100, ponto flutuante) de cada uma das oito competências, a partir da média das
 * respostas Likert daquela dimensão. Não arredonda — arredondar aqui, antes de usar o valor no
 * peso dos perfis, acumularia erro. Arredondamento só acontece em `roundForDisplay`.
 */
export function computeDimensionScores(answers: Answers): Record<Dimension, number> {
  const result = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) {
    const questions = LIKERT_QUESTIONS.filter((q) => q.dimension === dim);
    const sum = questions.reduce((acc, q) => {
      const v = answers[q.id];
      return acc + (typeof v === "number" ? v : 0);
    }, 0);
    const average = sum / questions.length;
    result[dim] = likertScoreFromAverage(average);
  }
  return result;
}

/** Soma dos bônus comportamentais (Q30-Q32) de um perfil, a partir das opções escolhidas. */
function behavioralBonus(answers: Answers, profile: FighterProfileKey): number {
  let bonus = 0;
  for (const q of BEHAVIORAL_QUESTIONS) {
    const chosen = answers[q.id];
    if (typeof chosen !== "string") continue;
    const weights = BEHAVIORAL_WEIGHTS[`${q.id}:${chosen}`];
    bonus += weights?.[profile] ?? 0;
  }
  return bonus;
}

/**
 * Score bruto (ponto flutuante, pode passar de 100 antes do clamp) de cada um dos seis perfis:
 * média ponderada das oito competências (pesos de FIGHTER_PROFILE_WEIGHTS, que somam 1 por
 * perfil) + o bônus aditivo das três questões comportamentais.
 */
export function computeProfileScoresRaw(
  dimensionScores: Record<Dimension, number>,
  answers: Answers,
): Record<FighterProfileKey, number> {
  const result = {} as Record<FighterProfileKey, number>;
  for (const profile of FIGHTER_PROFILES) {
    const weights = FIGHTER_PROFILE_WEIGHTS[profile];
    const weighted = DIMENSIONS.reduce((acc, dim) => acc + dimensionScores[dim] * weights[dim], 0);
    result[profile] = clamp(weighted + behavioralBonus(answers, profile), 0, 100);
  }
  return result;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Arredonda pra a camada de apresentação/persistência — chamar por último, nunca antes de calcular. */
export function roundScores<K extends string>(scores: Record<K, number>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k in scores) out[k] = Math.round(scores[k]);
  return out;
}

/**
 * Ordena os perfis do maior pro menor score, com desempate determinístico (ver
 * PROFILE_TIEBREAK_PRIORITY em fighterProfiles.ts): em score empatado, vence quem tiver maior
 * score na própria competência de maior peso; se ainda empatar, usa a prioridade global fixa.
 * Opera sobre os scores em ponto flutuante (não arredondados) — nunca depende da ordem de
 * iteração de um objeto/array do JS.
 */
export function rankProfiles(
  profileScoresRaw: Record<FighterProfileKey, number>,
  dimensionScores: Record<Dimension, number>,
): FighterProfileKey[] {
  function topDimensionScore(profile: FighterProfileKey): number {
    const weights = FIGHTER_PROFILE_WEIGHTS[profile];
    const topDim = (Object.keys(weights) as Dimension[]).reduce((best, d) => (weights[d] > weights[best] ? d : best));
    return dimensionScores[topDim];
  }

  return [...FIGHTER_PROFILES].sort((a, b) => {
    if (profileScoresRaw[b] !== profileScoresRaw[a]) return profileScoresRaw[b] - profileScoresRaw[a];
    const topDiff = topDimensionScore(b) - topDimensionScore(a);
    if (topDiff !== 0) return topDiff;
    return PROFILE_TIEBREAK_PRIORITY.indexOf(a) - PROFILE_TIEBREAK_PRIORITY.indexOf(b);
  });
}

export interface ScoringResult {
  dimensionScores: Record<Dimension, number>;
  profileScores: Record<FighterProfileKey, number>;
  rankedProfiles: FighterProfileKey[];
  primaryProfile: FighterProfileKey;
  secondaryProfile: FighterProfileKey;
}

/** Ponto de entrada único — respostas completas entram, resultado pronto pra exibir/persistir sai. */
export function scoreAssessment(answers: Answers): ScoringResult {
  const dimensionScoresRaw = computeDimensionScores(answers);
  const profileScoresRaw = computeProfileScoresRaw(dimensionScoresRaw, answers);
  const rankedProfiles = rankProfiles(profileScoresRaw, dimensionScoresRaw);

  return {
    dimensionScores: roundScores(dimensionScoresRaw),
    profileScores: roundScores(profileScoresRaw),
    rankedProfiles,
    primaryProfile: rankedProfiles[0],
    secondaryProfile: rankedProfiles[1],
  };
}

/** Competências ordenadas da maior pra menor — usa o score já arredondado (é o que o usuário vê). */
export function rankDimensions(dimensionScores: Record<Dimension, number>): Dimension[] {
  return [...DIMENSIONS].sort((a, b) => dimensionScores[b] - dimensionScores[a]);
}

export function topStrengths(dimensionScores: Record<Dimension, number>, n = 3): Dimension[] {
  return rankDimensions(dimensionScores).slice(0, n);
}

export function evolutionPriorities(dimensionScores: Record<Dimension, number>, n = 3): Dimension[] {
  return [...rankDimensions(dimensionScores)].reverse().slice(0, n);
}
