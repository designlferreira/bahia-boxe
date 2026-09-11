import { DIMENSIONS, type Dimension } from "./dimensions";
import type { LikertQuestion, Question } from "./questions";
import { FIGHTER_PROFILES, FIGHTER_PROFILE_WEIGHTS, BEHAVIORAL_WEIGHTS, PROFILE_TIEBREAK_PRIORITY, type FighterProfileKey } from "./fighterProfiles";
import { applyWingspanAnchor } from "./physicalAnchor";

export type BehavioralValue = "A" | "B" | "C" | "D" | "E";
/** `answers.q1` = 1-5 (Likert), `answers.q30` = "A".."E" (a maioria dos itens tem só A-D; ver `questions.ts`). */
export type Answers = Record<string, number | BehavioralValue>;

/**
 * `questions` é sempre a lista efetivamente apresentada (`getQuestions(assessmentType, length)`) —
 * nunca uma lista fixa. Curta e completa, aluno e professor, têm conjuntos de ids diferentes; usar
 * a lista errada aqui diria "faltam perguntas" para ids que nunca foram perguntados.
 */
export function missingQuestionIds(answers: Answers, questions: Question[]): string[] {
  return questions.filter((q) => answers[q.id] === undefined || answers[q.id] === null).map((q) => q.id);
}

export function isComplete(answers: Answers, questions: Question[]): boolean {
  return missingQuestionIds(answers, questions).length === 0;
}

/**
 * score = ((average - 1) / 4) * 100 — média 1→0, média 3→50, média 5→100, média 4.2→80.
 * Exportada (não só usada internamente) porque é a peça usada em outros lugares pra converter uma
 * diferença de score em "pontos Likert de diferença" (ex. `combined.ts`) sem repetir a fórmula.
 */
export function likertScoreFromAverage(average: number): number {
  return ((average - 1) / 4) * 100;
}

/**
 * Score bruto (0-100, ponto flutuante) de cada uma das oito competências, a partir da média das
 * respostas Likert daquela dimensão — só as perguntas efetivamente apresentadas (`likertQuestions`)
 * entram na média; na versão curta isso é 1 pergunta por dimensão, não 3-4. Não arredonda —
 * arredondar aqui, antes de usar o valor no peso dos perfis, acumularia erro. Arredondamento só
 * acontece em `roundScores`.
 */
export function computeDimensionScores(answers: Answers, likertQuestions: LikertQuestion[]): Record<Dimension, number> {
  const result = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) {
    const questions = likertQuestions.filter((q) => q.dimension === dim);
    const sum = questions.reduce((acc, q) => {
      const v = answers[q.id];
      return acc + (typeof v === "number" ? v : 0);
    }, 0);
    const average = sum / questions.length;
    result[dim] = likertScoreFromAverage(average);
  }
  return result;
}

/**
 * Score de escolha forçada de um perfil (0-100), normalizado pelo número de itens efetivamente
 * aplicáveis (`behavioralQuestionIds`) — não um total fixo. Isso é o que torna a exclusão dos itens
 * self-only na voz do professor automática: com menos itens aplicáveis, o mesmo peso final
 * (`FORCED_CHOICE_WEIGHT`) continua valendo o mesmo percentual do score, só dividido entre menos
 * perguntas (CLAUDE.md, "peso da escolha forçada sobe" — ponto 2/3).
 */
function behavioralScoreRaw(answers: Answers, profile: FighterProfileKey, behavioralQuestionIds: string[]): number {
  if (behavioralQuestionIds.length === 0) return 0;
  let votes = 0;
  for (const id of behavioralQuestionIds) {
    const chosen = answers[id];
    if (typeof chosen !== "string") continue;
    const weights = BEHAVIORAL_WEIGHTS[`${id}:${chosen}`];
    votes += weights?.[profile] ?? 0;
  }
  const maxPossibleVotes = 4 * behavioralQuestionIds.length; // cada item vale no máximo +4 pro perfil mais alinhado.
  return (votes / maxPossibleVotes) * 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Score bruto (ponto flutuante) de cada um dos seis perfis: mistura ponderada de dois sinais
 * normalizados independentemente — a média ponderada das oito dimensões (competência) e o score de
 * escolha forçada (estilo) — em vez do antigo bônus aditivo direto. A v1 somava o bônus por cima do
 * score de dimensões e cortava tudo no clamp de 100; pra um aluno já tecnicamente avançado (score
 * de dimensões perto de 100), isso absorvia quase todo o bônus de escolha forçada exatamente onde
 * ele deveria pesar mais. A mistura ponderada garante que `forcedChoiceWeight` sempre vale essa
 * fração do score final, não importa o nível técnico (CLAUDE.md, "peso da escolha forçada sobe").
 */
export function computeProfileScoresRaw(
  dimensionScores: Record<Dimension, number>,
  answers: Answers,
  behavioralQuestionIds: string[],
  forcedChoiceWeight: number,
): Record<FighterProfileKey, number> {
  const result = {} as Record<FighterProfileKey, number>;
  for (const profile of FIGHTER_PROFILES) {
    const weights = FIGHTER_PROFILE_WEIGHTS[profile];
    const dimensionScore = DIMENSIONS.reduce((acc, dim) => acc + dimensionScores[dim] * weights[dim], 0);
    const behavioralScore = behavioralScoreRaw(answers, profile, behavioralQuestionIds);
    const blended = (1 - forcedChoiceWeight) * dimensionScore + forcedChoiceWeight * behavioralScore;
    result[profile] = clamp(blended, 0, 100);
  }
  return result;
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

/**
 * Ponto de entrada único — respostas completas entram, resultado pronto pra exibir/persistir sai.
 *
 * `questions` é a lista efetivamente apresentada (decide quais Likert entram na média de cada
 * dimensão e quais itens de escolha forçada contam). `forcedChoiceWeight` vem de
 * `FORCED_CHOICE_WEIGHT[length]`. `wingspanIndex` só se aplica na versão completa, quando altura e
 * envergadura existem no cadastro do aluno — `null` (o default) não modifica nada (CLAUDE.md,
 * "Âncora física").
 */
export function scoreAssessment(answers: Answers, questions: Question[], forcedChoiceWeight: number, wingspanIndex: number | null = null): ScoringResult {
  const likertQuestions = questions.filter((q): q is LikertQuestion => q.type === "likert");
  const behavioralQuestionIds = questions.filter((q) => q.type === "behavioral").map((q) => q.id);

  const dimensionScoresRaw = computeDimensionScores(answers, likertQuestions);
  const profileScoresRawBase = computeProfileScoresRaw(dimensionScoresRaw, answers, behavioralQuestionIds, forcedChoiceWeight);
  const profileScoresRaw = applyWingspanAnchor(profileScoresRawBase, wingspanIndex);
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
