/**
 * Tela de abertura do app: enquanto a sessão carrega (`AuthContext.loading`). Antes, abrir o app instalado já logado passava pelo formulário
 * de Login (`/` mandava para `/login` sem esperar a sessão, e o Login só voltava para a home depois) — o formulário PISCAVA a cada abertura,
 * e as rotas protegidas ficavam vazias (`return null`). A marca respira devagar (`animate-bb-pulse`, desligada para quem pediu menos movimento).
 */
export function TelaDeAbertura() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6" aria-busy="true">
      <div aria-hidden className="font-display text-4xl tracking-wide text-foreground animate-bb-pulse">
        BAHIA BOXE
      </div>
      <p role="status" className="sr-only">
        Abrindo o Bahia Boxe…
      </p>
    </main>
  );
}
