import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  erro: Error | null;
}

/**
 * Última rede do app: um erro de RENDERIZAÇÃO (ou de efeito) em qualquer tela derrubava o app inteiro numa tela em branco, sem nada a fazer
 * (por exemplo, sem as credenciais do Supabase o `AuthProvider` lançava e `#root` ficava vazio). Fica em volta de TUDO em `main.tsx`, por isso
 * o aviso não usa Router, `AuthContext` nem nenhum provider: só HTML, o `Button` e uma recarga completa da página.
 *
 * NÃO pega: erro dentro de manipulador de clique, de `setTimeout` e de promessa (esses já têm aviso de erro nas telas: `onError` das
 * mutations, `ErrorState` das consultas). Também não recarrega sozinho (um erro persistente viraria um laço de recargas).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { erro: null };

  static getDerivedStateFromError(erro: Error): ErrorBoundaryState {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Erro inesperado no app:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <main role="alert" className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
        <div aria-hidden className="font-display text-xl tracking-wide text-muted-foreground">
          BAHIA BOXE
        </div>
        <div aria-hidden className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
          <TriangleAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="font-display text-2xl font-normal tracking-wide text-foreground">ALGO DEU ERRADO</h1>
        <p className="text-[13.5px] text-muted-foreground max-w-xs leading-snug">
          O app encontrou um problema e não conseguiu continuar. Recarregar costuma resolver. Se voltar a acontecer, fale com o seu professor.
        </p>
        <div className="mt-3 flex w-full max-w-xs flex-col gap-2.5">
          <Button size="lg" onClick={() => window.location.reload()}>
            Recarregar o app
          </Button>
          {/* Recarga completa em `/` (não um link do Router: ele não existe aqui e o estado quebrado continuaria na memória). */}
          <Button variant="secondary" size="lg" onClick={() => window.location.assign("/")}>
            Ir para o início
          </Button>
        </div>
        {/* Só no desenvolvimento: o texto técnico ajuda quem programa e só assusta quem usa. */}
        {import.meta.env.DEV && <p className="mt-4 max-w-sm break-words text-xs text-muted-foreground/80">{this.state.erro.message}</p>}
      </main>
    );
  }
}
