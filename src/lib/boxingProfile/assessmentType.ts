/**
 * Quem preencheu a avaliação. 'self' é a autoavaliação do aluno (única implementada até a Fase 1).
 * 'coach' é a leitura técnica do professor sobre o aluno — mesmas 32 perguntas (mesmos ids/
 * dimensões/motor de pontuação), só o texto muda de voz. Nenhum dos dois altera o algoritmo.
 */
export const ASSESSMENT_TYPES = ["self", "coach"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  self: "Autoavaliação",
  coach: "Avaliação do professor",
};
