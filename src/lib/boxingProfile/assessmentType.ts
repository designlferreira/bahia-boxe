/**
 * Quem preencheu a avaliação. 'self' é a autoavaliação do aluno. 'coach' é a leitura técnica do
 * professor sobre o aluno — mesmos ids/dimensões/motor de pontuação do 'self' (exceto os 2 itens
 * de escolha forçada sobre motivação interna, self-only — ver `questions.ts`), só o texto muda de
 * voz. Nenhum dos dois altera o algoritmo.
 */
export const ASSESSMENT_TYPES = ["self", "coach"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  self: "Autoavaliação",
  coach: "Avaliação do professor",
};
