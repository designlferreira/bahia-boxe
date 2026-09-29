import { SkeletonList } from "@/components/SkeletonCard";

/**
 * Fallback do carregamento SOB DEMANDA de cada tela (`React.lazy` em `App.tsx`): entre tocar num link e o pedaço de código da tela chegar,
 * a barra de baixo continua no lugar (o `Suspense` fica DENTRO dos layouts) e aqui aparece o esqueleto padrão. O pedaço é pequeno e fica
 * guardado depois da primeira vez, então quase nunca dá para ver isto numa rede boa.
 */
export function CarregandoTela() {
  return (
    <div className="page-container" aria-busy="true">
      <p role="status" className="sr-only">
        Carregando…
      </p>
      <div className="h-8 w-40 mb-5 rounded-lg bg-secondary/60" aria-hidden />
      <SkeletonList count={3} height={88} />
    </div>
  );
}
