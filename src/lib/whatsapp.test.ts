import { describe, expect, it } from "vitest";
import { normalizeWhatsapp } from "./whatsapp";

describe("normalizeWhatsapp", () => {
  it("aceita o número com máscara e acrescenta o 55", () => {
    expect(normalizeWhatsapp("(11) 94703-4983")).toBe("5511947034983");
  });
  it("aceita o número já com +55", () => {
    expect(normalizeWhatsapp("+55 11 94703-4983")).toBe("5511947034983");
  });
  it("aceita fixo de 10 dígitos", () => {
    expect(normalizeWhatsapp("1133334444")).toBe("551133334444");
  });
  it("recusa número incompleto", () => {
    expect(normalizeWhatsapp("94703-4983")).toBeNull();
  });
});
