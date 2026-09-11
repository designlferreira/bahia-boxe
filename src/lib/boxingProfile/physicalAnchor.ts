import type { FighterProfileKey } from "./fighterProfiles";

/**
 * Envergadura ÷ altura. Acima disso, o índice conta como "longo"; abaixo, como "curto"; entre os
 * dois, zona morta — sem efeito. Evita que 1cm de erro de medida decida uma modulação de score.
 * Números redondos, não validados por dados reais (CLAUDE.md, "Âncora física").
 */
export const WINGSPAN_INDEX_HIGH_THRESHOLD = 1.03;
export const WINGSPAN_INDEX_LOW_THRESHOLD = 0.97;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** `null` quando falta altura ou envergadura — nunca estimar uma a partir da outra. */
export function computeWingspanIndex(heightCm: number | null, wingspanCm: number | null): number | null {
  if (heightCm === null || wingspanCm === null || heightCm <= 0) return null;
  return wingspanCm / heightCm;
}

/**
 * Só bônus, nunca penalidade (CLAUDE.md, "Âncora física" — decisão revisada: antropometria informa
 * afinidade, não incapacidade). Envergadura longa favorece os estilos que jogam à distância
 * (Out-Boxer, e secundariamente Counterpuncher, que também depende de alcance pra ler e responder);
 * envergadura curta favorece os estilos que jogam de perto (Pressure Fighter, e secundariamente
 * Puncher). `wingspanIndex === null` (dado ausente) não modifica nada.
 */
export function applyWingspanAnchor(
  profileScores: Record<FighterProfileKey, number>,
  wingspanIndex: number | null,
): Record<FighterProfileKey, number> {
  if (wingspanIndex === null) return profileScores;
  const result = { ...profileScores };
  if (wingspanIndex >= WINGSPAN_INDEX_HIGH_THRESHOLD) {
    result.out_boxer = clamp(result.out_boxer + 5, 0, 100);
    result.counterpuncher = clamp(result.counterpuncher + 3, 0, 100);
  } else if (wingspanIndex <= WINGSPAN_INDEX_LOW_THRESHOLD) {
    result.pressure_fighter = clamp(result.pressure_fighter + 5, 0, 100);
    result.puncher = clamp(result.puncher + 3, 0, 100);
  }
  return result;
}
