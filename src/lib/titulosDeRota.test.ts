import { describe, expect, it } from "vitest";
import { tituloDaRota } from "./titulosDeRota";

describe("tituloDaRota", () => {
  it("resolve telas simples e com id", () => {
    expect(tituloDaRota("/admin/agenda")).toBe("Agenda");
    expect(tituloDaRota("/app/aula/123")).toBe("Detalhe da aula");
    expect(tituloDaRota("/convite/abc")).toBe("Convite");
  });
  it("as regras específicas vencem as gerais (aluno do professor)", () => {
    expect(tituloDaRota("/admin/alunos")).toBe("Alunos");
    expect(tituloDaRota("/admin/alunos/abc")).toBe("Detalhe do aluno");
    expect(tituloDaRota("/admin/alunos/abc/recorrencia")).toBe("Horários fixos");
    expect(tituloDaRota("/admin/alunos/abc/perfil-lutador/questionario")).toBe("Avaliar Perfil de Boxe");
  });
  it("ignora a barra final e devolve null para endereço desconhecido", () => {
    expect(tituloDaRota("/admin/agenda/")).toBe("Agenda");
    expect(tituloDaRota("/nao-existe")).toBeNull();
  });
});
