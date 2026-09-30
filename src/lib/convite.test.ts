import { describe, expect, it } from "vitest";
import { linkDoConvite, linkWhatsappConvite, mensagemDoConvite } from "./convite";

describe("convite", () => {
  it("monta o link na rota /convite/<token> da origem dada", () => {
    expect(linkDoConvite("abc123", "https://app.exemplo.com")).toBe("https://app.exemplo.com/convite/abc123");
  });

  it("a mensagem traz o link e a validade, sem citar marca", () => {
    const msg = mensagemDoConvite("https://app.exemplo.com/convite/abc", "07 out");
    expect(msg).toContain("https://app.exemplo.com/convite/abc");
    expect(msg).toContain("até 07 out");
    expect(msg.toLowerCase()).not.toContain("bahia");
  });

  it("com o nome do convidado a mensagem o chama pelo primeiro nome", () => {
    const msg = mensagemDoConvite("https://x.app/convite/abc", "07 out", "  Ana Beatriz Souza ");
    expect(msg.startsWith("Oi, Ana! ")).toBe(true);
    expect(msg).not.toContain("Beatriz");
  });

  it("sem nome, ou com nome só de espaços, continua 'Oi!'", () => {
    expect(mensagemDoConvite("l", "07 out").startsWith("Oi! ")).toBe(true);
    expect(mensagemDoConvite("l", "07 out", null).startsWith("Oi! ")).toBe(true);
    expect(mensagemDoConvite("l", "07 out", "   ").startsWith("Oi! ")).toBe(true);
  });

  it("o link do WhatsApp inclui o nome quando há", () => {
    const url = linkWhatsappConvite("https://x.app/convite/abc", "07 out", "Ana");
    expect(decodeURIComponent(url)).toContain("Oi, Ana!");
  });

  it("o link do WhatsApp codifica a mensagem inteira e não leva número", () => {
    const url = linkWhatsappConvite("https://app.exemplo.com/convite/abc?x=1&y=2", "07 out");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const texto = decodeURIComponent(url.slice("https://wa.me/?text=".length));
    expect(texto).toBe(mensagemDoConvite("https://app.exemplo.com/convite/abc?x=1&y=2", "07 out"));
  });
});
