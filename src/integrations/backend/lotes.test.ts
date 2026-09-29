import { describe, expect, it } from "vitest";
import { emLotes, todasAsPaginas } from "./api";

describe("emLotes", () => {
  it("fatia a lista em lotes de 100 e junta o resultado", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const tamanhos: number[] = [];
    const r = await emLotes(ids, async (lote) => {
      tamanhos.push(lote.length);
      return { data: lote.map((id) => ({ id })), error: null };
    });
    expect(tamanhos).toEqual([100, 100, 50]);
    expect(r.data).toHaveLength(250);
    expect(r.error).toBeNull();
  });
  it("lista vazia não faz chamada", async () => {
    let chamadas = 0;
    const r = await emLotes([], async () => {
      chamadas++;
      return { data: [], error: null };
    });
    expect(chamadas).toBe(0);
    expect(r.data).toEqual([]);
  });
  it("devolve o primeiro erro de qualquer lote", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);
    const r = await emLotes(ids, async (lote) => (lote[0] === "id100" ? { data: null, error: { message: "falhou" } } : { data: [], error: null }));
    expect(r.error?.message).toBe("falhou");
  });
});

describe("todasAsPaginas", () => {
  it("continua pedindo enquanto a página vier cheia (o servidor corta em 1000)", async () => {
    const pedidos: [number, number][] = [];
    const total = 2300;
    const r = await todasAsPaginas(async (de, ate) => {
      pedidos.push([de, ate]);
      const n = Math.max(0, Math.min(ate, total - 1) - de + 1);
      return { data: Array.from({ length: n }, (_, i) => ({ i: de + i })), error: null };
    });
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(r.data).toHaveLength(2300);
  });
  it("para no erro", async () => {
    const r = await todasAsPaginas(async () => ({ data: null, error: { message: "x" } }));
    expect(r.error?.message).toBe("x");
    expect(r.data).toBeNull();
  });
});
