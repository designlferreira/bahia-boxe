import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";

const DEMORA_MS = 8_000;

/**
 * Aviso de "está demorando": aparece quando há consulta em andamento há mais de 8s (rede lenta). Junto do tempo limite das chamadas
 * (`fetchComTempoLimite`, 25s), a pessoa nunca fica olhando um esqueleto sem explicação nem para sempre: primeiro este aviso, depois o erro
 * com "Tentar novamente". Some sozinho quando termina. Fica no rodapé, acima da barra de baixo, para não competir com a faixa de "sem internet".
 */
export function FaixaConexaoLenta({ amostra = false }: { amostra?: boolean } = {}) {
  const buscando = useIsFetching() > 0;
  const [demorou, setDemorou] = useState(false);

  useEffect(() => {
    if (!buscando) {
      setDemorou(false);
      return;
    }
    const t = setTimeout(() => setDemorou(true), DEMORA_MS);
    return () => clearTimeout(t);
  }, [buscando]);

  if (!demorou && !amostra) return null;
  return (
    <div
      role="status"
      className={`${amostra ? "absolute" : "fixed"} inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[90] flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-foreground shadow-lg`}
    >
      <Hourglass aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>Está demorando mais que o normal. Confira sua conexão; se não carregar, tente de novo.</span>
    </div>
  );
}
