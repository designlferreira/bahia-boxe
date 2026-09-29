import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Faz o conteúdo dar uma pequena pulsada de escala QUANDO `valor` muda (ex.: o selo de status vai de "Sem registro" para "Concluída"),
 * para mostrar que a ação pegou. NÃO anima na primeira montagem: só na troca, na mesma tela. Com "reduzir movimento" vira um esmaecimento
 * curto (ver `index.css`).
 */
export function EstaloAoMudar({ valor, children }: { valor: string; children: ReactNode }) {
  const anterior = useRef(valor);
  const [rodada, setRodada] = useState(0);
  useEffect(() => {
    if (anterior.current !== valor) {
      anterior.current = valor;
      setRodada((r) => r + 1);
    }
  }, [valor]);
  // `key` novo a cada troca: o elemento é recriado e a animação toca de novo, mesmo em trocas seguidas.
  return (
    <span key={rodada} className={rodada > 0 ? "inline-flex animate-bb-pop" : "inline-flex"}>
      {children}
    </span>
  );
}
