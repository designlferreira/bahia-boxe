import { Check } from "lucide-react";

/**
 * Regra de senha ("Pelo menos 8 caracteres"): feita = ✓ e a cor; não feita = ponto. A cor sozinha não distinguia pra quem não a
 * enxerga bem, e o leitor de tela precisa do estado por texto. Compartilhada por Criar conta/Convite (`ContaForm`) e Nova senha.
 */
export function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-accent" : "text-muted-foreground"}`}>
      {ok ? (
        <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />
      ) : (
        <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" />
      )}
      {label}
      <span className="sr-only">{ok ? " — atendido" : " — ainda não"}</span>
    </div>
  );
}
