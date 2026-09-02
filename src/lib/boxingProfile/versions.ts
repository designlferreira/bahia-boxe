/**
 * Toda avaliação concluída grava essas duas versões junto do resultado. Uma avaliação antiga
 * nunca é recalculada — se as perguntas ou os pesos mudarem, isso vira `-v2`, e as linhas antigas
 * continuam com o resultado que já foi calculado (e persistido) no momento da conclusão delas.
 */
export const QUESTIONNAIRE_VERSION = "boxing-profile-v1";
export const SCORING_VERSION = "scoring-v1";
