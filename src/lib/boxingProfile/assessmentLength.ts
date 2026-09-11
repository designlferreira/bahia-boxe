/**
 * Duas variantes do mesmo instrumento v2 — não confundir com `QUESTIONNAIRE_VERSION`/
 * `SCORING_VERSION` (que marcam a ÉPOCA/fórmula, nunca recalculada). Este eixo é ortogonal: dentro
 * da v2 atual, curta e completa convivem o tempo todo, e os scores de uma não são diretamente
 * comparáveis aos da outra (CLAUDE.md, "Compatibilidade entre curta e completa").
 */
export const ASSESSMENT_LENGTHS = ["short", "full"] as const;
export type AssessmentLength = (typeof ASSESSMENT_LENGTHS)[number];

export const ASSESSMENT_LENGTH_LABELS: Record<AssessmentLength, string> = {
  short: "Versão rápida",
  full: "Versão completa",
};

/**
 * Peso da escolha forçada no score final de cada perfil (CLAUDE.md, "peso da escolha forçada
 * sobe") — fração do score que vem das perguntas de escolha forçada, o resto vem das dimensões.
 * Maior na curta porque ali o sinal Likert é mais fraco (1 pergunta por dimensão em vez de 3-4).
 */
export const FORCED_CHOICE_WEIGHT: Record<AssessmentLength, number> = {
  full: 0.24,
  short: 0.3,
};
