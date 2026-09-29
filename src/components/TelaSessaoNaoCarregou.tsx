import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

/**
 * A sessão existe, mas o perfil não carregou (sem rede, servidor fora). Antes isso virava "sem perfil" e mandava a pessoa para o login
 * a cada oscilação de conexão — inclusive ao abrir o app instalado sem sinal. Aqui ela fica onde está, com "Tentar de novo".
 * "Entrar com outra conta" encerra a sessão local (caminho de saída para quem realmente quer trocar).
 */
export function TelaSessaoNaoCarregou() {
  const { retry, signOut } = useAuth();
  return (
    <main role="alert" className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center bg-background">
      <div aria-hidden className="font-display text-xl tracking-wide text-muted-foreground">
        BAHIA BOXE
      </div>
      <div aria-hidden className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="font-display text-2xl font-normal tracking-wide text-foreground">NÃO CONSEGUIMOS ABRIR SUA CONTA</h1>
      <p className="text-[13.5px] text-muted-foreground max-w-xs leading-snug">
        Parece um problema de conexão. Você continua conectado: confira o sinal e tente de novo.
      </p>
      <div className="mt-3 flex w-full max-w-xs flex-col gap-2.5">
        <Button size="lg" onClick={() => retry?.()}>
          Tentar de novo
        </Button>
        <Button variant="secondary" size="lg" onClick={() => void signOut()}>
          Entrar com outra conta
        </Button>
      </div>
    </main>
  );
}
