import { useEffect, useRef, useState, type ReactNode } from "react";
import { SAIDA_MS } from "@/hooks/useSaidaSuave";

/**
 * Um bloco que aparece e some (ex.: os botões "Aconteceu/Faltou" de um cartão da Agenda): quando `aberto` vira falso, em vez de sumir de
 * uma vez e encolher o cartão de repente, o bloco esmaece e fecha o espaço em `SAIDA_MS` ms (mesma saída de `useSaidaSuave`, para UM bloco).
 * Enquanto sai fica INERTE (sem foco, escondido do leitor de tela: a ação já foi feita) e mostra o ÚLTIMO conteúdo que teve aberto.
 * A estrutura é a mesma aberta ou fechando, então o conteúdo não é recriado na troca.
 */
export function FechaAoSair({ aberto, children }: { aberto: boolean; children: ReactNode }) {
  const ultimo = useRef<ReactNode>(children);
  const [presente, setPresente] = useState(aberto);
  if (aberto) ultimo.current = children;

  useEffect(() => {
    if (aberto) {
      setPresente(true);
      return;
    }
    const t = setTimeout(() => setPresente(false), SAIDA_MS);
    return () => clearTimeout(t);
  }, [aberto]);

  if (!aberto && !presente) return null;
  const saindo = !aberto;
  return (
    <div
      // React 18 não tem o tipo `inert`; o atributo funciona.
      {...({ inert: saindo ? "" : undefined } as Record<string, string | undefined>)}
      aria-hidden={saindo || undefined}
      className={saindo ? "grid animate-bb-sai" : "grid"}
    >
      <div className={saindo ? "min-h-0 overflow-hidden" : "min-h-0"}>{saindo ? ultimo.current : children}</div>
    </div>
  );
}
