import { DIMENSIONS, type Dimension } from "./dimensions";
import { FIGHTER_PROFILES, FIGHTER_PROFILE_WEIGHTS, type FighterProfileKey } from "./fighterProfiles";
import { rankProfiles, roundScores, likertScoreFromAverage } from "./scoring";

/**
 * Só o formato que a combinação precisa — evita um ciclo de import (`integrations/backend/types.ts`
 * já importa `Dimension` daqui; se este arquivo importasse `BoxingProfileAssessmentSummary` de lá,
 * fecharia o ciclo). `BoxingProfileAssessmentSummary` satisfaz esta forma estruturalmente.
 */
export interface CombinableAssessment {
  dimensionScores: Record<Dimension, number>;
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

/**
 * Score de cada perfil a partir dos scores de dimensão, pelos mesmos pesos de
 * `computeProfileScoresRaw` — sem o componente de escolha forçada, que não existe nesta camada: só
 * os `dimensionScores` já calculados de cada avaliação chegam aqui, não as respostas brutas.
 *
 * Isso era uma aproximação pequena na v1 (bônus aditivo de no máximo ~12 pontos). Na v2, escolha
 * forçada é 24%-30% do score de cada avaliação (`FORCED_CHOICE_WEIGHT`) — a aproximação aqui ficou
 * bem maior: o arquétipo combinado pode divergir do que sairia se a escolha forçada de cada lado
 * entrasse na conta. Não implementado — precisaria persistir o score de escolha forçada de cada
 * avaliação separadamente (hoje só o score final misturado é salvo), uma mudança de schema maior
 * que o pedido original. Registrado como dívida conhecida (CLAUDE.md, "Resultado combinado e o peso
 * maior da escolha forçada").
 */
function weightedProfileScores(dimensionScores: Record<Dimension, number>): Record<FighterProfileKey, number> {
  const result = {} as Record<FighterProfileKey, number>;
  for (const profile of FIGHTER_PROFILES) {
    const weights = FIGHTER_PROFILE_WEIGHTS[profile];
    const weighted = DIMENSIONS.reduce((acc, dim) => acc + dimensionScores[dim] * weights[dim], 0);
    result[profile] = clamp(weighted, 0, 100);
  }
  return result;
}

/**
 * Combina autoavaliação + avaliação do professor numa leitura só, por dimensão — nunca média de
 * arquétipos: a média acontece nas 8 competências primeiro, o arquétipo combinado é derivado dessa
 * média (CLAUDE.md, "Resultado combinado de Perfil de Boxe"). Deriva, não armazena — chamar de novo
 * sempre que uma das duas mudar, mesmo padrão de `calcular_saldo_pacote`.
 *
 * Se só um dos dois existir, retorna esse lado como está, marcado `isPartial`. Se nenhum existir,
 * retorna `null` — quem chama decide o que mostrar nesse caso (hoje, nada).
 */
export function combineAssessments(
  self: CombinableAssessment | undefined,
  coach: CombinableAssessment | undefined,
): CombinedResult | null {
  if (!self && !coach) return null;

  if (!self || !coach) {
    const only = (self ?? coach)!;
    const dimensionScoresRaw = only.dimensionScores;
    const profileScoresRaw = weightedProfileScores(dimensionScoresRaw);
    const rankedProfiles = rankProfiles(profileScoresRaw, dimensionScoresRaw);
    return {
      dimensionScores: roundScores(dimensionScoresRaw),
      profileScores: roundScores(profileScoresRaw),
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

  const profileScoresRaw = weightedProfileScores(dimensionScoresRaw);
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
