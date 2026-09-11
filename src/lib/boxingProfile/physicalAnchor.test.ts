import { describe, expect, it } from "vitest";
import { FIGHTER_PROFILES, type FighterProfileKey } from "./fighterProfiles";
import { applyWingspanAnchor, computeWingspanIndex, WINGSPAN_INDEX_HIGH_THRESHOLD, WINGSPAN_INDEX_LOW_THRESHOLD } from "./physicalAnchor";

function baseScores(value = 50): Record<FighterProfileKey, number> {
  const result = {} as Record<FighterProfileKey, number>;
  for (const p of FIGHTER_PROFILES) result[p] = value;
  return result;
}

describe("computeWingspanIndex", () => {
  it("envergadura ÷ altura quando as duas existem", () => {
    expect(computeWingspanIndex(170, 175)).toBeCloseTo(175 / 170, 10);
  });

  it("null quando falta altura ou envergadura — nunca estima uma a partir da outra", () => {
    expect(computeWingspanIndex(null, 175)).toBeNull();
    expect(computeWingspanIndex(170, null)).toBeNull();
    expect(computeWingspanIndex(null, null)).toBeNull();
  });

  it("null com altura zero ou negativa (guarda contra divisão inválida)", () => {
    expect(computeWingspanIndex(0, 175)).toBeNull();
  });
});

describe("applyWingspanAnchor — só bônus, nunca penalidade", () => {
  it("índice null não modifica nada", () => {
    const scores = baseScores();
    expect(applyWingspanAnchor(scores, null)).toEqual(scores);
  });

  it("zona morta (entre os dois limiares) não modifica nada", () => {
    const scores = baseScores();
    const mid = (WINGSPAN_INDEX_HIGH_THRESHOLD + WINGSPAN_INDEX_LOW_THRESHOLD) / 2;
    expect(applyWingspanAnchor(scores, mid)).toEqual(scores);
  });

  it("envergadura longa: +5 Out-Boxer, +3 Counterpuncher, nada mais muda", () => {
    const scores = baseScores(50);
    const result = applyWingspanAnchor(scores, WINGSPAN_INDEX_HIGH_THRESHOLD);
    expect(result.out_boxer).toBe(55);
    expect(result.counterpuncher).toBe(53);
    expect(result.pressure_fighter).toBe(50);
    expect(result.puncher).toBe(50);
    expect(result.boxer_puncher).toBe(50);
    expect(result.pressure_boxer).toBe(50);
  });

  it("envergadura curta: +5 Pressure Fighter, +3 Puncher, nada mais muda", () => {
    const scores = baseScores(50);
    const result = applyWingspanAnchor(scores, WINGSPAN_INDEX_LOW_THRESHOLD);
    expect(result.pressure_fighter).toBe(55);
    expect(result.puncher).toBe(53);
    expect(result.out_boxer).toBe(50);
    expect(result.counterpuncher).toBe(50);
  });

  it("nunca passa de 100 (clamp) mesmo perto do teto", () => {
    const scores = baseScores(98);
    const result = applyWingspanAnchor(scores, WINGSPAN_INDEX_HIGH_THRESHOLD);
    expect(result.out_boxer).toBe(100);
    expect(result.counterpuncher).toBe(100);
  });

  it("nunca fica negativo — não existe modulação negativa de qualquer forma", () => {
    const scores = baseScores(0);
    const result = applyWingspanAnchor(scores, WINGSPAN_INDEX_LOW_THRESHOLD);
    for (const p of FIGHTER_PROFILES) expect(result[p]).toBeGreaterThanOrEqual(0);
  });
});
