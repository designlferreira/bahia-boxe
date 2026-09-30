import { describe, expect, it } from "vitest";
import { extrairTokenDeConvite, SemVinculoError } from "./vinculo";

const TOKEN = "7f3ac9d2b84e4a1f9c0d5e6b2a8f1c3d7f3ac9d2b84e4a1f9c0d5e6b2a8f1c3d";

describe("extrairTokenDeConvite", () => {
  it("lê o token do link inteiro", () => {
    expect(extrairTokenDeConvite(`https://bahia-boxe.vercel.app/convite/${TOKEN}`)).toBe(TOKEN);
  });

  it("ignora espaços, parâmetros e texto em volta (mensagem inteira do WhatsApp)", () => {
    expect(extrairTokenDeConvite(`  Oi! Crie sua conta: https://x.app/convite/${TOKEN}?a=1  `)).toBe(TOKEN);
  });

  it("aceita só o código", () => {
    expect(extrairTokenDeConvite(TOKEN)).toBe(TOKEN);
  });

  it("recusa vazio, texto solto e código curto demais", () => {
    expect(extrairTokenDeConvite("")).toBeNull();
    expect(extrairTokenDeConvite("   ")).toBeNull();
    expect(extrairTokenDeConvite("meu convite")).toBeNull();
    expect(extrairTokenDeConvite("abc123")).toBeNull();
  });
});

describe("SemVinculoError", () => {
  it("é reconhecível e mantém a mensagem que o app já usava", () => {
    const e = new SemVinculoError();
    expect(e).toBeInstanceOf(SemVinculoError);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("Sua conta ainda não está vinculada a um professor.");
  });
});
