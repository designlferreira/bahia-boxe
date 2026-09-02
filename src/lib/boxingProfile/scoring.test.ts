import { describe, expect, it } from "vitest";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { LIKERT_QUESTIONS, QUESTIONS } from "./questions";
import { FIGHTER_PROFILES, PROFILE_TIEBREAK_PRIORITY, type FighterProfileKey } from "./fighterProfiles";
import {
  computeDimensionScores,
  computeProfileScoresRaw,
  evolutionPriorities,
  isComplete,
  likertScoreFromAverage,
  missingQuestionIds,
  rankDimensions,
  rankProfiles,
  roundScores,
  scoreAssessment,
  topStrengths,
  type Answers,
} from "./scoring";
import { QUESTIONNAIRE_VERSION, SCORING_VERSION } from "./versions";

/** Todas as 29 Likert no mesmo valor, exceto o que for sobrescrito por dimensão; comportamentais opcionais. */
function buildAnswers(
  opts: {
    defaultLikert?: number;
    byDimension?: Partial<Record<Dimension, number>>;
    behavioral?: Partial<Record<"q30" | "q31" | "q32", "A" | "B" | "C" | "D">>;
  } = {},
): Answers {
  const { defaultLikert = 3, byDimension = {}, behavioral = {} } = opts;
  const answers: Answers = {};
  for (const q of LIKERT_QUESTIONS) {
    answers[q.id] = byDimension[q.dimension] ?? defaultLikert;
  }
  answers.q30 = behavioral.q30 ?? "A";
  answers.q31 = behavioral.q31 ?? "A";
  answers.q32 = behavioral.q32 ?? "A";
  return answers;
}

describe("computeDimensionScores — fórmula da Fase 8", () => {
  it("média 1 -> score 0", () => {
    const answers = buildAnswers({ defaultLikert: 1 });
    const scores = computeDimensionScores(answers);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(0, 10);
  });

  it("média 3 -> score 50", () => {
    const answers = buildAnswers({ defaultLikert: 3 });
    const scores = computeDimensionScores(answers);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(50, 10);
  });

  it("média 5 -> score 100", () => {
    const answers = buildAnswers({ defaultLikert: 5 });
    const scores = computeDimensionScores(answers);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(100, 10);
  });

  it("média 4.2 -> score 80 (fórmula isolada — nenhuma dimensão do questionário tem contagem de questões que alcance 4.2 exato com respostas inteiras)", () => {
    expect(likertScoreFromAverage(4.2)).toBeCloseTo(80, 10);
  });

  it("computeDimensionScores usa a mesma fórmula para uma dimensão real (attack, 4 questões: 4,4,4,5 -> média 4.25 -> score 81.25)", () => {
    const answers = buildAnswers({ defaultLikert: 3 });
    answers.q1 = 4;
    answers.q2 = 4;
    answers.q3 = 4;
    answers.q4 = 5;
    const scores = computeDimensionScores(answers);
    expect(scores.attack).toBeCloseTo(likertScoreFromAverage(4.25), 10);
    expect(scores.attack).toBeCloseTo(81.25, 10);
  });

  it("cada dimensão é calculada de forma independente das demais", () => {
    const answers = buildAnswers({ defaultLikert: 2, byDimension: { attack: 5 } });
    const scores = computeDimensionScores(answers);
    expect(scores.attack).toBeCloseTo(100, 10);
    expect(scores.defense).toBeCloseTo(((2 - 1) / 4) * 100, 10);
    expect(scores.power).toBeCloseTo(((2 - 1) / 4) * 100, 10);
  });

  it("scores nunca saem do intervalo 0-100 mesmo em respostas mistas", () => {
    const answers = buildAnswers({ defaultLikert: 1, byDimension: { attack: 5, defense: 3 } });
    const scores = computeDimensionScores(answers);
    for (const dim of DIMENSIONS) {
      expect(scores[dim]).toBeGreaterThanOrEqual(0);
      expect(scores[dim]).toBeLessThanOrEqual(100);
    }
  });
});

describe("isComplete / missingQuestionIds", () => {
  it("aponta as 32 questões como faltando quando não há nenhuma resposta", () => {
    expect(missingQuestionIds({})).toHaveLength(32);
    expect(isComplete({})).toBe(false);
  });

  it("aponta só o que falta quando parcialmente respondido", () => {
    const answers = buildAnswers();
    delete (answers as Record<string, unknown>).q17;
    expect(missingQuestionIds(answers)).toEqual(["q17"]);
    expect(isComplete(answers)).toBe(false);
  });

  it("completo quando as 32 questões têm resposta", () => {
    const answers = buildAnswers();
    expect(isComplete(answers)).toBe(true);
  });
});

describe("fixtures sintéticas por perfil — Fase 25", () => {
  // Fixtures deliberadamente simples (alto nas dimensões que definem o perfil, baixo nas
  // demais) para validar COMPORTAMENTO ("esse perfil aparece entre os mais altos"), não para
  // replicar a matriz de pesos linha por linha — isso seria um teste viciado.

  it("out-boxer: movimentação/precisão/velocidade altas + comportamento de controle de distância -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { movement: 5, precision: 5, speed: 5, reading: 4 },
      behavioral: { q30: "A", q31: "A", q32: "A" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("out_boxer");
  });

  it("pressure fighter: ataque/condicionamento altos + comportamento de pressão -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, conditioning: 5, movement: 4 },
      behavioral: { q30: "B", q31: "C", q32: "B" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("pressure_fighter");
  });

  it("puncher: potência/ataque altos + preferência por golpe contundente -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { power: 5, attack: 5, precision: 4 },
      behavioral: { q30: "C", q31: "C", q32: "C" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("puncher");
  });

  it("counterpuncher: leitura/defesa/precisão altas + comportamento de contra-ataque -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { reading: 5, defense: 5, precision: 5, speed: 4 },
      behavioral: { q30: "C", q31: "B", q32: "A" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("counterpuncher");
  });

  it("boxer-puncher: ataque/potência/precisão/movimentação/leitura equilibradamente altos -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, power: 5, precision: 5, movement: 5, reading: 5 },
      behavioral: { q30: "D", q31: "D", q32: "D" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("boxer_puncher");
  });

  it("pressure boxer: ataque/movimentação/condicionamento/leitura altos -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, movement: 5, conditioning: 5, reading: 5 },
      behavioral: { q30: "D", q31: "D", q32: "D" },
    });
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles.slice(0, 2)).toContain("pressure_boxer");
  });
});

describe("primário / secundário / ranking", () => {
  it("primaryProfile é sempre o primeiro do ranking, secondaryProfile o segundo", () => {
    const answers = buildAnswers({ byDimension: { power: 5, attack: 5 } });
    const result = scoreAssessment(answers);
    expect(result.primaryProfile).toBe(result.rankedProfiles[0]);
    expect(result.secondaryProfile).toBe(result.rankedProfiles[1]);
  });

  it("ranking contém os 6 perfis exatamente uma vez", () => {
    const answers = buildAnswers();
    const result = scoreAssessment(answers);
    expect(result.rankedProfiles).toHaveLength(6);
    expect(new Set(result.rankedProfiles).size).toBe(6);
    for (const p of FIGHTER_PROFILES) expect(result.rankedProfiles).toContain(p);
  });
});

describe("empate e desempate determinístico — Fase 11", () => {
  it("dois perfis com score idêntico são desempatados pela competência de maior peso; resultado é estável entre chamadas", () => {
    // Todas as dimensões no mesmo valor produz o mesmo score bruto ponderado pra todo perfil
    // (soma dos pesos = 1 em cada linha), então todos os 6 empatam exatamente.
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 62.5; // qualquer valor constante serve
    const profileScores = {} as Record<FighterProfileKey, number>;
    for (const p of FIGHTER_PROFILES) profileScores[p] = 62.5;

    const ranked1 = rankProfiles(profileScores, dims);
    const ranked2 = rankProfiles(profileScores, dims);
    expect(ranked1).toEqual(ranked2);

    // Com todas as dimensões exatamente iguais, o desempate por "competência de maior peso"
    // também empata para todo mundo — cai na prioridade global documentada.
    expect(ranked1).toEqual(PROFILE_TIEBREAK_PRIORITY);
  });

  it("empate de score final é resolvido pela maior competência de peso do perfil quando as dimensões não são todas iguais", () => {
    const profileScores = {} as Record<FighterProfileKey, number>;
    for (const p of FIGHTER_PROFILES) profileScores[p] = 70; // todos empatados no score final

    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 50;
    // out_boxer tem "movement" como maior peso (0.2); deixamos movement muito alto para ele
    // vencer o desempate sobre os demais, que têm outras dimensões como maior peso.
    dims.movement = 100;

    const ranked = rankProfiles(profileScores, dims);
    expect(ranked[0]).toBe("out_boxer");
  });
});

describe("scores mínimos e máximos", () => {
  it("todas as respostas em 1: dimensões em 0, nenhum perfil passa de 0 (bônus comportamental não empurra abaixo de 0)", () => {
    const answers = buildAnswers({ defaultLikert: 1, behavioral: { q30: "A", q31: "A", q32: "A" } });
    const result = scoreAssessment(answers);
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(0);
    for (const p of FIGHTER_PROFILES) {
      expect(result.profileScores[p]).toBeGreaterThanOrEqual(0);
      expect(result.profileScores[p]).toBeLessThanOrEqual(100);
    }
  });

  it("todas as respostas em 5: dimensões em 100, nenhum perfil passa de 100 mesmo com bônus comportamental (clamp)", () => {
    const answers = buildAnswers({ defaultLikert: 5, behavioral: { q30: "A", q31: "A", q32: "A" } });
    const result = scoreAssessment(answers);
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(100);
    for (const p of FIGHTER_PROFILES) expect(result.profileScores[p]).toBeLessThanOrEqual(100);
    // out_boxer é o mais beneficiado pelo comportamento "A" nas 3 questões — com dimensões já em
    // 100, o bônus deveria estourar 100 sem o clamp.
    expect(result.profileScores.out_boxer).toBe(100);
  });
});

describe("ordenação de competências / pontos fortes / prioridades — Fases 15-16", () => {
  it("rankDimensions ordena da maior pra menor", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 2, byDimension: { attack: 5, defense: 4 } })));
    const ranked = rankDimensions(scores);
    for (let i = 1; i < ranked.length; i++) {
      expect(scores[ranked[i - 1]]).toBeGreaterThanOrEqual(scores[ranked[i]]);
    }
  });

  it("topStrengths devolve as 3 maiores", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 2, byDimension: { attack: 5, defense: 5, power: 5 } })));
    const strengths = topStrengths(scores, 3);
    expect(strengths).toHaveLength(3);
    expect(strengths).toEqual(expect.arrayContaining(["attack", "defense", "power"]));
  });

  it("evolutionPriorities devolve as menores, nunca chamadas de \"pontos fracos\" na config (só o nome da função já documenta isso)", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 4, byDimension: { conditioning: 1, power: 1 } })));
    const priorities = evolutionPriorities(scores, 2);
    expect(priorities).toEqual(expect.arrayContaining(["conditioning", "power"]));
  });

  it("pontos fortes e prioridades nunca se sobrepõem quando há variação real nos scores", () => {
    const scores = roundScores(
      computeDimensionScores(buildAnswers({ defaultLikert: 3, byDimension: { attack: 5, defense: 5, power: 5, conditioning: 1, speed: 1 } })),
    );
    const strengths = new Set(topStrengths(scores, 3));
    const priorities = new Set(evolutionPriorities(scores, 2));
    for (const d of priorities) expect(strengths.has(d)).toBe(false);
  });
});

describe("computeProfileScoresRaw — pesos por perfil somam 1", () => {
  it("cada linha da matriz de pesos soma exatamente 1", async () => {
    const { FIGHTER_PROFILE_WEIGHTS } = await import("./fighterProfiles");
    for (const profile of FIGHTER_PROFILES) {
      const sum = DIMENSIONS.reduce((acc, d) => acc + FIGHTER_PROFILE_WEIGHTS[profile][d], 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("com todas as dimensões no mesmo valor e nenhuma resposta comportamental, o score bruto do perfil é exatamente esse valor", () => {
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 73;
    const raw = computeProfileScoresRaw(dims, {}); // sem q30/q31/q32 -> bônus comportamental 0 para todos
    for (const p of FIGHTER_PROFILES) expect(raw[p]).toBeCloseTo(73, 10);
  });
});

describe("versionamento — Fase 18", () => {
  it("QUESTIONNAIRE_VERSION e SCORING_VERSION são strings não vazias", () => {
    expect(typeof QUESTIONNAIRE_VERSION).toBe("string");
    expect(QUESTIONNAIRE_VERSION.length).toBeGreaterThan(0);
    expect(typeof SCORING_VERSION).toBe("string");
    expect(SCORING_VERSION.length).toBeGreaterThan(0);
  });
});

describe("configuração das questões", () => {
  it("existem exatamente 32 questões", () => {
    expect(QUESTIONS).toHaveLength(32);
  });

  it("questões 1-29 são likert, 30-32 são comportamentais", () => {
    const likertIds = QUESTIONS.slice(0, 29).map((q) => q.id);
    const behavioralIds = QUESTIONS.slice(29).map((q) => q.id);
    expect(likertIds).toEqual(Array.from({ length: 29 }, (_, i) => `q${i + 1}`));
    expect(behavioralIds).toEqual(["q30", "q31", "q32"]);
    for (const q of QUESTIONS.slice(0, 29)) expect(q.type).toBe("likert");
    for (const q of QUESTIONS.slice(29)) expect(q.type).toBe("behavioral");
  });

  it("cada dimensão tem pelo menos uma questão mapeada", () => {
    for (const dim of DIMENSIONS) {
      expect(LIKERT_QUESTIONS.some((q) => q.dimension === dim)).toBe(true);
    }
  });
});
