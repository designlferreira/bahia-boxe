import { describe, expect, it } from "vitest";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { FIGHTER_PROFILES, type FighterProfileKey } from "./fighterProfiles";
import type { AssessmentType } from "./assessmentType";
import type { AssessmentLength } from "./assessmentLength";
import type { Answers } from "./scoring";
import { combineAssessments, type CombinableAssessment } from "./combined";

/** Todas as 8 dimensões no mesmo score, exceto o que for sobrescrito. */
function dims(defaultScore: number, overrides: Partial<Record<Dimension, number>> = {}): Record<Dimension, number> {
  const result = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) result[dim] = overrides[dim] ?? defaultScore;
  return result;
}

function profiles(defaultScore = 50, overrides: Partial<Record<FighterProfileKey, number>> = {}): Record<FighterProfileKey, number> {
  const result = {} as Record<FighterProfileKey, number>;
  for (const p of FIGHTER_PROFILES) result[p] = overrides[p] ?? defaultScore;
  return result;
}

/** Fixture completa — default 'full' e sem respostas, pra testes que só querem mexer em dimensionScores. */
function assessment(opts: {
  assessmentType: AssessmentType;
  dimensionScores: Record<Dimension, number>;
  profileScores?: Record<FighterProfileKey, number>;
  answers?: Answers;
  assessmentLength?: AssessmentLength;
}): CombinableAssessment {
  return {
    assessmentType: opts.assessmentType,
    assessmentLength: opts.assessmentLength ?? "full",
    dimensionScores: opts.dimensionScores,
    profileScores: opts.profileScores ?? profiles(),
    answers: opts.answers ?? {},
  };
}

describe("combineAssessments — nenhum dos dois existe", () => {
  it("retorna null", () => {
    expect(combineAssessments(undefined, undefined)).toBeNull();
  });
});

describe("combineAssessments — só um dos dois existe", () => {
  it("só self: isPartial true, missingSide 'coach', usa dimensionScores E profileScores como já existiam, sem recalcular", () => {
    // profileScores deliberadamente diferente do que a pura ponderação por dimensão produziria —
    // é o achado da revisão: esse número já inclui a escolha forçada daquela avaliação, descartar
    // e recalcular só com dimensão jogava fora informação real.
    const distinctiveProfileScores = profiles(50, { out_boxer: 91 });
    const self = assessment({ assessmentType: "self", dimensionScores: dims(60, { power: 90 }), profileScores: distinctiveProfileScores });
    const result = combineAssessments(self, undefined)!;
    expect(result.isPartial).toBe(true);
    expect(result.missingSide).toBe("coach");
    expect(result.dimensionScores).toEqual(self.dimensionScores);
    expect(result.profileScores).toEqual(distinctiveProfileScores);
    expect(result.isDivergent).toBe(false);
  });

  it("só coach: isPartial true, missingSide 'self'", () => {
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(40) });
    const result = combineAssessments(undefined, coach)!;
    expect(result.isPartial).toBe(true);
    expect(result.missingSide).toBe("self");
    expect(result.dimensionScores).toEqual(coach.dimensionScores);
    expect(result.profileScores).toEqual(coach.profileScores);
  });
});

describe("combineAssessments — os dois existem, sem divergência", () => {
  it("dimensionScores é a média simples por dimensão, não a média dos arquétipos", () => {
    const self = assessment({ assessmentType: "self", dimensionScores: dims(50) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(56) });
    const result = combineAssessments(self, coach)!;
    expect(result.isPartial).toBe(false);
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(53); // (50+56)/2
    expect(result.isDivergent).toBe(false);
    expect(result.divergentDimension).toBeNull();
  });
});

describe("combineAssessments — limiar isolado (25 pontos = 1 ponto Likert de diferença média)", () => {
  it("diferença de exatamente 25 numa dimensão NÃO dispara (é '>', não '>=')", () => {
    const self = assessment({ assessmentType: "self", dimensionScores: dims(50, { power: 50 }) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(50, { power: 75 }) });
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(false);
  });

  it("diferença acima de 25 numa única dimensão dispara e nomeia essa dimensão", () => {
    const self = assessment({ assessmentType: "self", dimensionScores: dims(50, { power: 50 }) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(50, { power: 76 }) });
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(true);
    expect(result.divergentDimension).toBe("power");
  });
});

describe("combineAssessments — limiar agregado (média das 8 diferenças > 15)", () => {
  it("desacordo espalhado sem nenhuma dimensão isolada estourar dispara, mas sem nomear dimensão", () => {
    // diferença de 20 em todas as 8 dimensões: média = 20 (> 15), máximo = 20 (não > 25)
    const self = assessment({ assessmentType: "self", dimensionScores: dims(40) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(60) });
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(true);
    expect(result.divergentDimension).toBeNull();
  });

  it("desacordo pequeno e espalhado não dispara nenhum dos dois gatilhos", () => {
    const self = assessment({ assessmentType: "self", dimensionScores: dims(50) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(60) });
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(false);
  });
});

describe("combineAssessments — arquétipo combinado deriva da média por dimensão", () => {
  it("não é a média nem a escolha entre os dois arquétipos individuais", () => {
    // self forte em power/attack (puncher), coach forte em reading/defense/precision (counterpuncher).
    const self = assessment({ assessmentType: "self", dimensionScores: dims(30, { power: 90, attack: 85, precision: 60 }) });
    const coach = assessment({ assessmentType: "coach", dimensionScores: dims(30, { reading: 90, defense: 85, precision: 70 }) });
    const result = combineAssessments(self, coach)!;
    const expectedCombinedPrecision = Math.round((60 + 70) / 2);
    expect(result.dimensionScores.precision).toBe(expectedCombinedPrecision);
    expect(result.rankedProfiles).toHaveLength(6);
  });
});

describe("combineAssessments — escolha forçada entra na combinação (corrige a lacuna da v2)", () => {
  it("com dimensões empatadas entre todos os perfis, respostas de escolha forçada favorecendo o mesmo perfil dos dois lados decidem o arquétipo combinado", () => {
    // Todas as 8 dimensões em 50 para os dois lados: como os pesos de cada perfil somam 1, o
    // componente de dimensão fica EXATAMENTE igual (50) pra todo perfil — qualquer diferença no
    // ranking só pode vir da escolha forçada.
    const uniformDims = dims(50);

    const withoutAnswers = combineAssessments(
      assessment({ assessmentType: "self", dimensionScores: uniformDims }),
      assessment({ assessmentType: "coach", dimensionScores: uniformDims }),
    )!;
    // Sem nenhuma resposta de escolha forçada, tudo empata (dimensão E escolha forçada, ambas 0
    // de diferença) — cai na prioridade de desempate fixa, cujo primeiro é counterpuncher.
    expect(withoutAnswers.primaryProfile).toBe("counterpuncher");

    // q30/q31/q32 respondidas "A" nos dois lados favorecem out_boxer (+4 cada, "controlar a
    // distância" / "sair da distância" / "controlar o ritmo").
    const favoringOutBoxer: Answers = { q30: "A", q31: "A", q32: "A" };
    const withAnswers = combineAssessments(
      assessment({ assessmentType: "self", dimensionScores: uniformDims, answers: favoringOutBoxer }),
      assessment({ assessmentType: "coach", dimensionScores: uniformDims, answers: favoringOutBoxer }),
    )!;
    expect(withAnswers.primaryProfile).toBe("out_boxer");
  });

  it("o peso da escolha forçada usado na combinação é a média dos pesos de origem — igual quando os dois lados são da mesma variante", () => {
    const uniformDims = dims(50);
    // q30:B e q32:B favorecem pressure_fighter (+4 cada); q31 fica sem resposta de propósito.
    const favoringPressureFighter: Answers = { q30: "B", q32: "B" };
    // Os dois 'full' (peso 0.24 dos dois lados -> média 0.24, igual a usar 0.24 direto).
    const bothFull = combineAssessments(
      assessment({ assessmentType: "self", assessmentLength: "full", dimensionScores: uniformDims, answers: favoringPressureFighter }),
      assessment({ assessmentType: "coach", assessmentLength: "full", dimensionScores: uniformDims, answers: favoringPressureFighter }),
    )!;
    expect(bothFull.primaryProfile).toBe("pressure_fighter");
  });
});
