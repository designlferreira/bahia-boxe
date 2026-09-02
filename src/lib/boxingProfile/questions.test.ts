import { describe, expect, it } from "vitest";
import { COACH_QUESTIONS, QUESTIONS, getQuestions } from "./questions";
import { isComplete, missingQuestionIds, scoreAssessment } from "./scoring";

/**
 * A garantia estrutural por trás da Fase 2 (avaliação 'coach'): as duas listas de perguntas têm
 * que compartilhar exatamente ids/dimensão/tipo/opções — só o texto muda de voz. Se isso quebrar
 * (alguém edita um esqueleto e esquece o outro, por exemplo), o motor de pontuação passaria a
 * tratar 'self' e 'coach' de forma diferente silenciosamente, o que a Fase 2 explicitamente não
 * queria.
 */
describe("COACH_QUESTIONS compartilha o esqueleto de QUESTIONS", () => {
  it("mesmos 32 ids, na mesma ordem", () => {
    expect(COACH_QUESTIONS.map((q) => q.id)).toEqual(QUESTIONS.map((q) => q.id));
  });

  it("mesmo tipo (likert/behavioral) por id", () => {
    QUESTIONS.forEach((q, i) => {
      expect(COACH_QUESTIONS[i].type).toBe(q.type);
    });
  });

  it("mesma dimensão por pergunta likert", () => {
    QUESTIONS.forEach((q, i) => {
      if (q.type === "likert") {
        expect(COACH_QUESTIONS[i]).toMatchObject({ type: "likert", dimension: q.dimension });
      }
    });
  });

  it("mesmas opções (mesmos values) por pergunta comportamental", () => {
    QUESTIONS.forEach((q, i) => {
      if (q.type === "behavioral") {
        const coachQ = COACH_QUESTIONS[i];
        expect(coachQ.type).toBe("behavioral");
        if (coachQ.type === "behavioral") {
          expect(coachQ.options.map((o) => o.value)).toEqual(q.options.map((o) => o.value));
        }
      }
    });
  });

  it("nenhum texto de pergunta ficou igual entre as duas vozes (reescrita de verdade, não cópia)", () => {
    QUESTIONS.forEach((q, i) => {
      expect(COACH_QUESTIONS[i].text).not.toBe(q.text);
    });
  });

  it("getQuestions('self') e getQuestions('coach') retornam as listas certas", () => {
    expect(getQuestions("self")).toBe(QUESTIONS);
    expect(getQuestions("coach")).toBe(COACH_QUESTIONS);
  });

  it("o motor de pontuação trata um conjunto de respostas 'coach' exatamente como um 'self' com os mesmos ids", () => {
    // Só os ids importam pro algoritmo — constrói respostas a partir de COACH_QUESTIONS (voz do
    // professor) e confirma que isComplete/scoreAssessment funcionam igual a um envio 'self'.
    const answers: Record<string, number | "A" | "B" | "C" | "D"> = {};
    for (const q of COACH_QUESTIONS) {
      answers[q.id] = q.type === "likert" ? 4 : "B";
    }
    expect(missingQuestionIds(answers)).toHaveLength(0);
    expect(isComplete(answers)).toBe(true);
    const result = scoreAssessment(answers);
    expect(Object.keys(result.dimensionScores)).toHaveLength(8);
    expect(result.primaryProfile).toBeDefined();
  });
});
