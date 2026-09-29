import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function assinar(aoMudar: () => void) {
  window.addEventListener("online", aoMudar);
  window.addEventListener("offline", aoMudar);
  return () => {
    window.removeEventListener("online", aoMudar);
    window.removeEventListener("offline", aoMudar);
  };
}

/**
 * Sem internet o TanStack Query PAUSA as consultas (esqueleto para sempre, sem erro) e retoma sozinho quando a rede volta.
 * Esta faixa diz o que está acontecendo. Fica no topo, acima de tudo, e some sozinha ao reconectar.
 * `navigator.onLine` falso é confiável (não há rede); verdadeiro não garante internet, então a faixa só aparece no primeiro caso.
 */
export function FaixaSemInternet({ amostra = false }: { amostra?: boolean } = {}) {
  const online = useSyncExternalStore(
    assinar,
    () => navigator.onLine,
    () => true,
  );
  if (online && !amostra) return null;
  return (
    <div
      role="status"
      className={`${amostra ? "absolute" : "fixed"} inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-[hsl(var(--amber))] px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] text-[13px] font-semibold text-[hsl(var(--amber-foreground))]`}
    >
      <WifiOff aria-hidden className="h-4 w-4 shrink-0" />
      <span>Sem internet. O que já carregou continua aqui, mas não dá para salvar.</span>
    </div>
  );
}
