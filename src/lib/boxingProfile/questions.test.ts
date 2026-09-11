import { describe, expect, it } from "vitest";
import { COACH_QUESTIONS, QUESTIONS, getQuestions } from "./questions";
import { isComplete, missingQuestionIds, scoreAssessment } from "./scoring";
import { FORCED_CHOICE_WEIGHT } from "./assessmentLength";

const SELF_ONLY_IDS = ["q36", "q37"];

/**
 * A garantia estrutural por trás da avaliação 'coach': as perguntas compartilhadas entre as duas
 * vozes têm que ter exatamente os mesmos ids/dimensão/tipo/opções — só o texto muda de voz. Se
 * isso quebrar (alguém edita um esqueleto e esquece o outro), o motor de pontuação passaria a
 * tratar 'self' e 'coach' de forma diferente silenciosamente.
 */
describe("COACH_QUESTIONS compartilha o esqueleto de QUESTIONS, exceto os 2 itens self-only", () => {
  const sharedSelf = QUESTIONS.filter((q) => !SELF_ONLY_IDS.includes(q.id));

  it("mesmos ids, na mesma ordem, para as perguntas compartilhadas", () => {
    expect(COACH_QUESTIONS.map((q) => q.id)).toEqual(sharedSelf.map((q) => q.id));
  });

  it("COACH_QUESTIONS nunca inclui os ids self-only", () => {
    for (const id of SELF_ONLY_IDS) {
      expect(COACH_QUESTIONS.some((q) => q.id === id)).toBe(false);
    }
  });

  it("mesmo tipo (likert/behavioral) por id", () => {
    sharedSelf.forEach((q, i) => {
      expect(COACH_QUESTIONS[i].type).toBe(q.type);
    });
  });

  it("mesma dimensão por pergunta likert", () => {
    sharedSelf.forEach((q, i) => {
      if (q.type === "likert") {
        expect(COACH_QUESTIONS[i]).toMatchObject({ type: "likert", dimension: q.dimension });
      }
    });
  });

  it("mesmas opções (mesmos values) por pergunta comportamental", () => {
    sharedSelf.forEach((q, i) => {
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
    sharedSelf.forEach((q, i) => {
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
    const answers: Record<string, number | "A" | "B" | "C" | "D" | "E"> = {};
    for (const q of COACH_QUESTIONS) {
      answers[q.id] = q.type === "likert" ? 4 : "B";
    }
    expect(missingQuestionIds(answers, COACH_QUESTIONS)).toHaveLength(0);
    expect(isComplete(answers, COACH_QUESTIONS)).toBe(true);
    const result = scoreAssessment(answers, COACH_QUESTIONS, FORCED_CHOICE_WEIGHT.full);
    expect(Object.keys(result.dimensionScores)).toHaveLength(8);
    expect(result.primaryProfile).toBeDefined();
  });
});

describe("getQuestions — variantes curta/completa por voz", () => {
  it("aluno completa: 37 (29 likert + 8 forçadas)", () => {
    expect(getQuestions("self", "full")).toHaveLength(37);
  });

  it("professor completa: 35 (29 likert + 6 forçadas, sem os self-only)", () => {
    expect(getQuestions("coach", "full")).toHaveLength(35);
  });

  it("aluno curta: 14 (8 likert + 6 forçadas)", () => {
    const short = getQuestions("self", "short");
    expect(short).toHaveLength(14);
    expect(short.filter((q) => q.type === "likert")).toHaveLength(8);
    expect(short.filter((q) => q.type === "behavioral")).toHaveLength(6);
  });

  it("professor curta: 14 (8 likert + 6 forçadas) — mesmas 6 forçadas da completa dele", () => {
    const short = getQuestions("coach", "short");
    expect(short).toHaveLength(14);
    expect(short.filter((q) => q.type === "behavioral").map((q) => q.id)).toEqual(
      getQuestions("coach", "full")
        .filter((q) => q.type === "behavioral")
        .map((q) => q.id),
    );
  });

  it("aluno curta inclui FC-D (self-only) mas não FC-E", () => {
    const shortIds = getQuestions("self", "short").map((q) => q.id);
    expect(shortIds).toContain("q36"); // FC-D
    expect(shortIds).not.toContain("q37"); // FC-E
  });

  it("as 8 perguntas likert da versão curta são as mesmas para aluno e professor", () => {
    const selfShortLikert = getQuestions("self", "short")
      .filter((q) => q.type === "likert")
      .map((q) => q.id);
    const coachShortLikert = getQuestions("coach", "short")
      .filter((q) => q.type === "likert")
      .map((q) => q.id);
    expect(selfShortLikert).toEqual(coachShortLikert);
    expect(selfShortLikert).toEqual(["q3", "q7", "q11", "q15", "q16", "q21", "q24", "q29"]);
  });
});
