import { describe, expect, it } from "vitest";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { LIKERT_QUESTIONS, QUESTIONS, getQuestions } from "./questions";
import { FIGHTER_PROFILES, PROFILE_TIEBREAK_PRIORITY, type FighterProfileKey } from "./fighterProfiles";
import { FORCED_CHOICE_WEIGHT } from "./assessmentLength";
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

const FULL_WEIGHT = FORCED_CHOICE_WEIGHT.full;

/** Todas as 29 Likert no mesmo valor, exceto o que for sobrescrito por dimensão; comportamentais opcionais (default "A" nas 8). */
function buildAnswers(
  opts: {
    defaultLikert?: number;
    byDimension?: Partial<Record<Dimension, number>>;
    behavioral?: Partial<Record<string, "A" | "B" | "C" | "D" | "E">>;
  } = {},
): Answers {
  const { defaultLikert = 3, byDimension = {}, behavioral = {} } = opts;
  const answers: Answers = {};
  for (const q of LIKERT_QUESTIONS) {
    answers[q.id] = byDimension[q.dimension] ?? defaultLikert;
  }
  for (const id of ["q30", "q31", "q32", "q33", "q34", "q35", "q36", "q37"]) {
    answers[id] = behavioral[id] ?? "A";
  }
  return answers;
}

describe("computeDimensionScores — fórmula da Fase 8", () => {
  it("média 1 -> score 0", () => {
    const answers = buildAnswers({ defaultLikert: 1 });
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(0, 10);
  });

  it("média 3 -> score 50", () => {
    const answers = buildAnswers({ defaultLikert: 3 });
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(50, 10);
  });

  it("média 5 -> score 100", () => {
    const answers = buildAnswers({ defaultLikert: 5 });
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
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
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
    expect(scores.attack).toBeCloseTo(likertScoreFromAverage(4.25), 10);
    expect(scores.attack).toBeCloseTo(81.25, 10);
  });

  it("cada dimensão é calculada de forma independente das demais", () => {
    const answers = buildAnswers({ defaultLikert: 2, byDimension: { attack: 5 } });
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
    expect(scores.attack).toBeCloseTo(100, 10);
    expect(scores.defense).toBeCloseTo(((2 - 1) / 4) * 100, 10);
    expect(scores.power).toBeCloseTo(((2 - 1) / 4) * 100, 10);
  });

  it("scores nunca saem do intervalo 0-100 mesmo em respostas mistas", () => {
    const answers = buildAnswers({ defaultLikert: 1, byDimension: { attack: 5, defense: 3 } });
    const scores = computeDimensionScores(answers, LIKERT_QUESTIONS);
    for (const dim of DIMENSIONS) {
      expect(scores[dim]).toBeGreaterThanOrEqual(0);
      expect(scores[dim]).toBeLessThanOrEqual(100);
    }
  });

  it("versão curta: 1 pergunta por dimensão, a média é a própria resposta", () => {
    const shortQuestions = getQuestions("self", "short");
    const shortLikert = shortQuestions.filter((q) => q.type === "likert");
    expect(shortLikert).toHaveLength(8);
    const answers: Answers = {};
    for (const q of shortLikert) answers[q.id] = 5;
    const scores = computeDimensionScores(answers, shortLikert);
    for (const dim of DIMENSIONS) expect(scores[dim]).toBeCloseTo(100, 10);
  });
});

describe("isComplete / missingQuestionIds — dependem da lista efetivamente apresentada", () => {
  it("aponta as 37 questões da versão completa do aluno como faltando quando não há nenhuma resposta", () => {
    expect(missingQuestionIds({}, QUESTIONS)).toHaveLength(37);
    expect(isComplete({}, QUESTIONS)).toBe(false);
  });

  it("aponta só o que falta quando parcialmente respondido", () => {
    const answers = buildAnswers();
    delete (answers as Record<string, unknown>).q17;
    expect(missingQuestionIds(answers, QUESTIONS)).toEqual(["q17"]);
    expect(isComplete(answers, QUESTIONS)).toBe(false);
  });

  it("completo quando as 37 questões têm resposta", () => {
    const answers = buildAnswers();
    expect(isComplete(answers, QUESTIONS)).toBe(true);
  });

  it("a versão curta (14 perguntas) não exige as perguntas que só existem na completa", () => {
    const shortQuestions = getQuestions("self", "short");
    expect(shortQuestions).toHaveLength(14);
    const answers: Answers = {};
    for (const q of shortQuestions) answers[q.id] = q.type === "likert" ? 3 : "A";
    expect(isComplete(answers, shortQuestions)).toBe(true);
  });

  it("a lista do professor nunca inclui os itens self-only (q36/q37), mesmo sem resposta a eles", () => {
    const coachFull = getQuestions("coach", "full");
    const answers: Answers = {};
    for (const q of coachFull) answers[q.id] = q.type === "likert" ? 3 : "A";
    expect(isComplete(answers, coachFull)).toBe(true);
    expect(missingQuestionIds(answers, coachFull)).toHaveLength(0);
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
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("out_boxer");
  });

  it("pressure fighter: ataque/condicionamento altos + comportamento de pressão -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, conditioning: 5, movement: 4 },
      behavioral: { q30: "B", q31: "C", q32: "B" },
    });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("pressure_fighter");
  });

  it("puncher: potência/ataque altos + preferência por golpe contundente -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { power: 5, attack: 5, precision: 4 },
      behavioral: { q30: "C", q31: "C", q32: "C" },
    });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("puncher");
  });

  it("counterpuncher: leitura/defesa/precisão altas + comportamento de contra-ataque -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { reading: 5, defense: 5, precision: 5, speed: 4 },
      behavioral: { q30: "C", q31: "B", q32: "A" },
    });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("counterpuncher");
  });

  it("boxer-puncher: ataque/potência/precisão/movimentação/leitura equilibradamente altos -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, power: 5, precision: 5, movement: 5, reading: 5 },
      behavioral: { q30: "D", q31: "D", q32: "D" },
    });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("boxer_puncher");
  });

  it("pressure boxer: ataque/movimentação/condicionamento/leitura altos -> entre os 2 primeiros", () => {
    const answers = buildAnswers({
      defaultLikert: 2,
      byDimension: { attack: 5, movement: 5, conditioning: 5, reading: 5 },
      behavioral: { q30: "D", q31: "D", q32: "D" },
    });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.rankedProfiles.slice(0, 2)).toContain("pressure_boxer");
  });
});

describe("primário / secundário / ranking", () => {
  it("primaryProfile é sempre o primeiro do ranking, secondaryProfile o segundo", () => {
    const answers = buildAnswers({ byDimension: { power: 5, attack: 5 } });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    expect(result.primaryProfile).toBe(result.rankedProfiles[0]);
    expect(result.secondaryProfile).toBe(result.rankedProfiles[1]);
  });

  it("ranking contém os 6 perfis exatamente uma vez", () => {
    const answers = buildAnswers();
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
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

describe("computeProfileScoresRaw — mistura ponderada entre dimensões e escolha forçada (v2)", () => {
  it("com forcedChoiceWeight 0, o score do perfil é exatamente a soma ponderada das dimensões (pesos somam 1)", () => {
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 73;
    const raw = computeProfileScoresRaw(dims, {}, [], 0);
    for (const p of FIGHTER_PROFILES) expect(raw[p]).toBeCloseTo(73, 10);
  });

  it("com forcedChoiceWeight 1, o score do perfil é só o score de escolha forçada, ignorando dimensões", () => {
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 0; // dimensões baixas, não deveriam importar aqui
    const answers: Answers = { q30: "A", q31: "A", q32: "A" }; // as 3 opções "A" favorecem out_boxer
    const raw = computeProfileScoresRaw(dims, answers, ["q30", "q31", "q32"], 1);
    // out_boxer ganha voto máximo (+4) nas 3 -> 12 de 12 possíveis (3 itens x 4) = 100
    expect(raw.out_boxer).toBeCloseTo(100, 10);
    // counterpuncher ganha só o "voto de consolação" (+2) em q30:A e q32:A -> 4 de 12 = 33.33
    expect(raw.counterpuncher).toBeCloseTo((4 / 12) * 100, 10);
  });

  it("um perfil que vence o voto máximo em todos os itens aplicáveis chega a 100 no score de escolha forçada", () => {
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 0;
    // q33:A, q34:A favorecem pressure_fighter com +4 cada; usando só esses dois itens como aplicáveis.
    const answers: Answers = { q33: "A", q34: "A" };
    const raw = computeProfileScoresRaw(dims, answers, ["q33", "q34"], 1);
    expect(raw.pressure_fighter).toBeCloseTo(100, 10);
  });

  it("normalização se ajusta ao número de itens aplicáveis — menos itens (voz do professor) não muda o peso final da escolha forçada", () => {
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 0;
    const answers: Answers = { q30: "B", q33: "A", q34: "A" }; // todos favorecem pressure_fighter com +4
    const raw = computeProfileScoresRaw(dims, answers, ["q30", "q33", "q34"], 0.3);
    // votos 12 de 12 possíveis (3 itens x 4) -> score de escolha forçada 100 -> blended = 0.3*100 = 30
    expect(raw.pressure_fighter).toBeCloseTo(30, 10);
  });
});

describe("scoreAssessment — clamp e limites", () => {
  it("todas as respostas em 1, sem escolha forçada aplicável: dimensões em 0, todo perfil em 0", () => {
    const answers = buildAnswers({ defaultLikert: 1 });
    const result = scoreAssessment(answers, QUESTIONS, 0); // peso 0 isola o efeito das dimensões
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(0);
    for (const p of FIGHTER_PROFILES) expect(result.profileScores[p]).toBe(0);
  });

  it("dimensões em 100 + escolha forçada toda pro mesmo perfil: nunca passa de 100 (clamp)", () => {
    // out_boxer: q33:B (+4), q35:A (+4) — usar só esses dois na conta pra garantir 100% de votos.
    const answers = buildAnswers({ defaultLikert: 5, behavioral: { q33: "B", q35: "A" } });
    const result = scoreAssessment(answers, QUESTIONS, FULL_WEIGHT);
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(100);
    for (const p of FIGHTER_PROFILES) {
      expect(result.profileScores[p]).toBeGreaterThanOrEqual(0);
      expect(result.profileScores[p]).toBeLessThanOrEqual(100);
    }
  });

  it("um score de dimensões alto não engole o sinal de escolha forçada (o bug que motivou a v2)", () => {
    // Dimensões todas em 90 (nível técnico alto) — em v1, um bônus aditivo estouraria o clamp de
    // 100 quase imediatamente e o desempate cairia pra dimensão, não pra escolha forçada. Em v2, a
    // mistura ponderada garante que a escolha forçada continua valendo sua fração do score mesmo
    // aqui: dois perfis com a MESMA soma ponderada de dimensões devem se separar pela escolha
    // forçada, não empatar e cair no desempate por dimensão.
    const dims = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) dims[d] = 90;
    const noVotes = computeProfileScoresRaw(dims, {}, ["q33"], FULL_WEIGHT);
    const withVotes = computeProfileScoresRaw(dims, { q33: "B" }, ["q33"], FULL_WEIGHT); // q33:B favorece out_boxer
    expect(withVotes.out_boxer).toBeGreaterThan(noVotes.out_boxer);
  });
});

describe("ordenação de competências / pontos fortes / prioridades — Fases 15-16", () => {
  it("rankDimensions ordena da maior pra menor", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 2, byDimension: { attack: 5, defense: 4 } }), LIKERT_QUESTIONS));
    const ranked = rankDimensions(scores);
    for (let i = 1; i < ranked.length; i++) {
      expect(scores[ranked[i - 1]]).toBeGreaterThanOrEqual(scores[ranked[i]]);
    }
  });

  it("topStrengths devolve as 3 maiores", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 2, byDimension: { attack: 5, defense: 5, power: 5 } }), LIKERT_QUESTIONS));
    const strengths = topStrengths(scores, 3);
    expect(strengths).toHaveLength(3);
    expect(strengths).toEqual(expect.arrayContaining(["attack", "defense", "power"]));
  });

  it("evolutionPriorities devolve as menores, nunca chamadas de \"pontos fracos\" na config (só o nome da função já documenta isso)", () => {
    const scores = roundScores(computeDimensionScores(buildAnswers({ defaultLikert: 4, byDimension: { conditioning: 1, power: 1 } }), LIKERT_QUESTIONS));
    const priorities = evolutionPriorities(scores, 2);
    expect(priorities).toEqual(expect.arrayContaining(["conditioning", "power"]));
  });

  it("pontos fortes e prioridades nunca se sobrepõem quando há variação real nos scores", () => {
    const scores = roundScores(
      computeDimensionScores(
        buildAnswers({ defaultLikert: 3, byDimension: { attack: 5, defense: 5, power: 5, conditioning: 1, speed: 1 } }),
        LIKERT_QUESTIONS,
      ),
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
});

describe("versionamento — Fase 18", () => {
  it("QUESTIONNAIRE_VERSION e SCORING_VERSION são strings não vazias", () => {
    expect(typeof QUESTIONNAIRE_VERSION).toBe("string");
    expect(QUESTIONNAIRE_VERSION.length).toBeGreaterThan(0);
    expect(typeof SCORING_VERSION).toBe("string");
    expect(SCORING_VERSION.length).toBeGreaterThan(0);
  });
});

describe("configuração das questões — v2", () => {
  it("versão completa do aluno tem 37 questões: 29 likert + 8 forçadas", () => {
    expect(QUESTIONS).toHaveLength(37);
    const likertIds = QUESTIONS.filter((q) => q.type === "likert").map((q) => q.id);
    const behavioralIds = QUESTIONS.filter((q) => q.type === "behavioral").map((q) => q.id);
    expect(likertIds).toEqual(Array.from({ length: 29 }, (_, i) => `q${i + 1}`));
    expect(behavioralIds).toEqual(["q30", "q31", "q32", "q33", "q34", "q35", "q36", "q37"]);
  });

  it("versão completa do professor tem 35 questões: 29 likert + 6 forçadas (sem os 2 self-only)", () => {
    const coachFull = getQuestions("coach", "full");
    expect(coachFull).toHaveLength(35);
    const behavioralIds = coachFull.filter((q) => q.type === "behavioral").map((q) => q.id);
    expect(behavioralIds).toEqual(["q30", "q31", "q32", "q33", "q34", "q35"]);
  });

  it("versão curta tem 14 questões (aluno e professor), 8 likert + 6 forçadas", () => {
    expect(getQuestions("self", "short")).toHaveLength(14);
    expect(getQuestions("coach", "short")).toHaveLength(14);
  });

  it("curta e completa do professor usam exatamente as mesmas 6 perguntas de escolha forçada", () => {
    const shortBehavioral = getQuestions("coach", "short")
      .filter((q) => q.type === "behavioral")
      .map((q) => q.id);
    const fullBehavioral = getQuestions("coach", "full")
      .filter((q) => q.type === "behavioral")
      .map((q) => q.id);
    expect(shortBehavioral).toEqual(fullBehavioral);
  });

  it("cada dimensão tem pelo menos uma questão mapeada", () => {
    for (const dim of DIMENSIONS) {
      expect(LIKERT_QUESTIONS.some((q) => q.dimension === dim)).toBe(true);
    }
  });
});
