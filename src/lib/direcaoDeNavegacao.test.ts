import { describe, expect, it } from "vitest";
import { direcaoDeNavegacao } from "./direcaoDeNavegacao";

describe("direcaoDeNavegacao", () => {
  it("primeira tela e mesmo caminho ficam na entrada padrão", () => {
    expect(direcaoDeNavegacao("PUSH", null, "/admin/agenda")).toBeNull();
    expect(direcaoDeNavegacao("PUSH", "/admin/agenda", "/admin/agenda/")).toBeNull();
  });
  it("trocar de aba é só esmaecer", () => {
    expect(direcaoDeNavegacao("PUSH", "/admin/agenda", "/admin/alunos")).toBe("aba");
    expect(direcaoDeNavegacao("PUSH", "/app/aula/1", "/app/home")).toBe("aba");
  });
  it("abrir uma tela mais funda entra pela direita", () => {
    expect(direcaoDeNavegacao("PUSH", "/admin/alunos", "/admin/alunos/abc")).toBe("avancar");
    expect(direcaoDeNavegacao("PUSH", "/admin/dashboard", "/admin/solicitacoes")).toBe("avancar");
    expect(direcaoDeNavegacao("REPLACE", "/login", "/criar-conta")).toBe("avancar");
  });
  it("voltar (POP) entra pela esquerda, mesmo numa aba", () => {
    expect(direcaoDeNavegacao("POP", "/admin/alunos/abc", "/admin/alunos")).toBe("voltar");
  });
});
