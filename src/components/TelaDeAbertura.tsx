/**
 * Tela de abertura do app: enquanto a sessão carrega (`AuthContext.loading`). Antes, abrir o app instalado já logado passava pelo formulário
 * de Login (`/` mandava para `/login` sem esperar a sessão, e o Login só voltava para a home depois) — o formulário PISCAVA a cada abertura,
 * e as rotas protegidas ficavam vazias (`return null`). A marca respira devagar (`animate-bb-pulse`, desligada para quem pediu menos movimento).
 */
export function TelaDeAbertura() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6" aria-busy="true">
      <img
        src="/logo-bahia-boxe.png"
        alt=""
        aria-hidden
        width={600}
        height={400}
        className="w-full max-w-[240px] h-auto animate-bb-pulse"
      />
      <p role="status" className="sr-only">
        Abrindo o Bahia Boxe…
      </p>
    </main>
  );
}
