import { describe, expect, it } from "vitest";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { combineAssessments } from "./combined";

/** Todas as 8 dimensões no mesmo score, exceto o que for sobrescrito. */
function scores(defaultScore: number, overrides: Partial<Record<Dimension, number>> = {}): Record<Dimension, number> {
  const result = {} as Record<Dimension, number>;
  for (const dim of DIMENSIONS) result[dim] = overrides[dim] ?? defaultScore;
  return result;
}

describe("combineAssessments — nenhum dos dois existe", () => {
  it("retorna null", () => {
    expect(combineAssessments(undefined, undefined)).toBeNull();
  });
});

describe("combineAssessments — só um dos dois existe", () => {
  it("só self: isPartial true, missingSide 'coach', usa os scores do self como estão", () => {
    const self = { dimensionScores: scores(60, { power: 90 }) };
    const result = combineAssessments(self, undefined)!;
    expect(result.isPartial).toBe(true);
    expect(result.missingSide).toBe("coach");
    expect(result.dimensionScores).toEqual(self.dimensionScores);
    expect(result.isDivergent).toBe(false);
  });

  it("só coach: isPartial true, missingSide 'self'", () => {
    const coach = { dimensionScores: scores(40) };
    const result = combineAssessments(undefined, coach)!;
    expect(result.isPartial).toBe(true);
    expect(result.missingSide).toBe("self");
    expect(result.dimensionScores).toEqual(coach.dimensionScores);
  });
});

describe("combineAssessments — os dois existem, sem divergência", () => {
  it("dimensionScores é a média simples por dimensão, não a média dos arquétipos", () => {
    const self = { dimensionScores: scores(50) };
    const coach = { dimensionScores: scores(56) };
    const result = combineAssessments(self, coach)!;
    expect(result.isPartial).toBe(false);
    for (const dim of DIMENSIONS) expect(result.dimensionScores[dim]).toBe(53); // (50+56)/2
    expect(result.isDivergent).toBe(false);
    expect(result.divergentDimension).toBeNull();
  });
});

describe("combineAssessments — limiar isolado (25 pontos = 1 ponto Likert de diferença média)", () => {
  it("diferença de exatamente 25 numa dimensão NÃO dispara (é '>', não '>=')", () => {
    const self = { dimensionScores: scores(50, { power: 50 }) };
    const coach = { dimensionScores: scores(50, { power: 75 }) };
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(false);
  });

  it("diferença acima de 25 numa única dimensão dispara e nomeia essa dimensão", () => {
    const self = { dimensionScores: scores(50, { power: 50 }) };
    const coach = { dimensionScores: scores(50, { power: 76 }) };
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(true);
    expect(result.divergentDimension).toBe("power");
  });
});

describe("combineAssessments — limiar agregado (média das 8 diferenças > 15)", () => {
  it("desacordo espalhado sem nenhuma dimensão isolada estourar dispara, mas sem nomear dimensão", () => {
    // diferença de 20 em todas as 8 dimensões: média = 20 (> 15), máximo = 20 (não > 25)
    const self = { dimensionScores: scores(40) };
    const coach = { dimensionScores: scores(60) };
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(true);
    expect(result.divergentDimension).toBeNull();
  });

  it("desacordo pequeno e espalhado não dispara nenhum dos dois gatilhos", () => {
    const self = { dimensionScores: scores(50) };
    const coach = { dimensionScores: scores(60) };
    const result = combineAssessments(self, coach)!;
    expect(result.isDivergent).toBe(false);
  });
});

describe("combineAssessments — arquétipo combinado deriva da média por dimensão", () => {
  it("não é a média nem a escolha entre os dois arquétipos individuais", () => {
    // self forte em power/attack (puncher), coach forte em reading/defense/precision (counterpuncher).
    // O combinado deve ser derivado da MÉDIA por dimensão, não de uma média ou escolha entre os dois primaryProfile.
    const self = { dimensionScores: scores(30, { power: 90, attack: 85, precision: 60 }) };
    const coach = { dimensionScores: scores(30, { reading: 90, defense: 85, precision: 70 }) };
    const result = combineAssessments(self, coach)!;
    const expectedCombinedPrecision = Math.round((60 + 70) / 2);
    expect(result.dimensionScores.precision).toBe(expectedCombinedPrecision);
    // O primaryProfile combinado é sempre um dos seis arquétipos válidos, computado — não copiado de nenhum dos dois lados.
    expect(result.rankedProfiles).toHaveLength(6);
  });
});
