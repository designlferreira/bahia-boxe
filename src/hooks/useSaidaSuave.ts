import { useEffect, useRef, useState } from "react";

export const SAIDA_MS = 220;

/**
 * Lista que deixa o item que SUMIU ficar mais um instante, marcado como `saindo`, para a tela animar a saída (esmaecer e fechar o espaço)
 * em vez de o item desaparecer de uma vez. Os dados continuam mandando: o item já saiu da lista de verdade; isto só o segura na tela por
 * `SAIDA_MS` ms, na posição em que estava. Nada dispara na primeira montagem. Quem renderiza um item `saindo` deve deixá-lo INERTE
 * (sem foco, escondido do leitor de tela): a ação já foi feita.
 */
export function useSaidaSuave<T>(itens: T[], idDe: (t: T) => string): { item: T; saindo: boolean }[] {
  const anterior = useRef<T[]>(itens);
  const [saindo, setSaindo] = useState<{ item: T; indice: number }[]>([]);

  useEffect(() => {
    const ids = new Set(itens.map(idDe));
    const foram = anterior.current
      .map((item, indice) => ({ item, indice }))
      .filter(({ item }) => !ids.has(idDe(item)));
    anterior.current = itens;
    if (foram.length === 0) return;
    setSaindo((atual) => [...atual, ...foram]);
    const t = setTimeout(() => {
      const idsForam = new Set(foram.map((f) => idDe(f.item)));
      setSaindo((atual) => atual.filter((s) => !idsForam.has(idDe(s.item))));
    }, SAIDA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  const resultado = itens.map((item) => ({ item, saindo: false }));
  // Cada item que saiu volta para o índice em que estava (o menor índice primeiro, para as posições não se deslocarem entre si).
  for (const s of [...saindo].sort((a, b) => a.indice - b.indice)) {
    if (resultado.some((r) => idDe(r.item) === idDe(s.item))) continue;
    resultado.splice(Math.min(s.indice, resultado.length), 0, { item: s.item, saindo: true });
  }
  return resultado;
}
