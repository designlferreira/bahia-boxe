import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useAuth } from "@/context/AuthContext";

/**
 * Página que não existe. Quem chega aqui quase nunca digitou o endereço: é um link antigo (WhatsApp, e-mail), um convite ou uma senha
 * redefinida com o link cortado, ou o app instalado numa versão velha. No app instalado NÃO há barra de endereço nem botão de voltar do
 * navegador, então os botões desta tela são a única saída: "Voltar" (ao lugar de onde a pessoa veio) e um destino que depende da sessão
 * (`/` já manda cada papel para a sua home; deslogado, "Entrar").
 */
/** `amostra`: só para a galeria de desenvolvimento (não mexe no título nem no foco da página de amostras); sem efeito no app. */
export default function NotFound({ amostra = false }: { amostra?: boolean } = {}) {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // O React Router guarda a posição no histórico em `history.state.idx`: só há para onde voltar se ela for maior que zero.
  const podeVoltar = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

  useEffect(() => {
    if (amostra) return;
    // Nenhuma tela do app define o título da aba: esta se distingue no histórico e para o leitor de tela.
    const anterior = document.title;
    document.title = "Página não encontrada · Bahia Boxe";
    // Mudou de tela sem recarregar: o foco vai para o título, senão o leitor de tela continua na página anterior.
    tituloRef.current?.focus();
    return () => {
      document.title = anterior;
    };
  }, [amostra]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
      <div aria-hidden className="font-display text-xl tracking-wide text-muted-foreground">
        BAHIA BOXE
      </div>
      <div aria-hidden className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <SearchX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 ref={tituloRef} tabIndex={-1} className="font-display text-2xl font-normal tracking-wide text-foreground focus:outline-none">
        NÃO ACHAMOS ESSA PÁGINA
      </h1>
      <p className="text-[13.5px] text-muted-foreground max-w-xs leading-snug">
        O link pode estar antigo ou incompleto. Volte ao início e siga por lá.
      </p>

      {/* Sem saber ainda se há sessão, os botões esperam (senão "Entrar" apareceria por um instante para quem está logado). */}
      <div className="mt-3 flex w-full max-w-xs flex-col gap-2.5">
        {loading ? (
          <SkeletonCard height={52} />
        ) : (
          <>
            <Button asChild size="lg">
              <Link to={profile ? "/" : "/login"}>{profile ? "Ir para o início" : "Entrar"}</Link>
            </Button>
            {podeVoltar && (
              <Button variant="secondary" size="lg" onClick={() => navigate(-1)}>
                Voltar
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
