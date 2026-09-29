import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeDay } from "./dateUtils";

describe("formatRelativeDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Agora: quarta, 30/09/2026, 10:00 em São Paulo (13:00 UTC).
  function setNow() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T13:00:00Z"));
  }

  it("diz Hoje para mais tarde no mesmo dia", () => {
    setNow();
    expect(formatRelativeDay("2026-09-30T22:00:00Z")).toBe("Hoje"); // 19:00 em SP
  });

  it("diz Amanhã para o dia seguinte", () => {
    setNow();
    expect(formatRelativeDay("2026-10-01T22:00:00Z")).toBe("Amanhã");
  });

  it("usa o dia civil de São Paulo, não o de UTC", () => {
    setNow();
    // 01/10 01:00 UTC = 30/09 22:00 em SP -> ainda é hoje.
    expect(formatRelativeDay("2026-10-01T01:00:00Z")).toBe("Hoje");
  });

  it("depois de amanhã vira o dia da semana por extenso", () => {
    setNow();
    expect(formatRelativeDay("2026-10-02T22:00:00Z")).toBe("Sexta-feira");
  });
});
