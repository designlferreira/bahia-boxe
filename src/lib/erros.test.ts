import { describe, expect, it } from "vitest";
import { mensagemDeErro } from "./erros";

const F = "Não foi possível salvar.";

describe("mensagemDeErro", () => {
  it("troca falha de rede por frase de conexão", () => {
    expect(mensagemDeErro(new TypeError("Failed to fetch"), F)).toMatch(/Sem conexão/);
    expect(mensagemDeErro(new Error("Load failed"), F)).toMatch(/Sem conexão/);
  });
  it("diz que a conexão está lenta quando estoura o tempo limite", () => {
    expect(mensagemDeErro(new DOMException("conexao_lenta", "TimeoutError"), F)).toMatch(/lenta/);
    expect(mensagemDeErro(new Error("TimeoutError: conexao_lenta"), F)).toMatch(/lenta/);
  });
  it("pede novo login quando a sessão venceu", () => {
    expect(mensagemDeErro(new Error("JWT expired"), F)).toMatch(/sessão venceu/);
  });
  it("esconde códigos e mensagens técnicas", () => {
    expect(mensagemDeErro(new Error("not_allowed"), F)).toBe(F);
    expect(mensagemDeErro(new Error("new row violates row-level security policy for table \"x\""), F)).toBe(F);
    expect(mensagemDeErro(new Error("Cannot read properties of undefined"), F)).toBe(F);
  });
  it("mantém frases em português escritas de propósito", () => {
    expect(mensagemDeErro(new Error("Esse horário acabou de ser ocupado. Escolha outro horário."), F)).toMatch(/ocupado/);
  });
  it("usa o texto de reserva quando não é um Error", () => {
    expect(mensagemDeErro("boom", F)).toBe(F);
    expect(mensagemDeErro(new Error(""), F)).toBe(F);
  });
});
