import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/lib/bookingStatus";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
  audience?: "admin" | "student";
  /**
   * Aula `scheduled` cujo horário já passou: o professor ainda não disse se aconteceu. "Agendada"
   * ali engana — e é o estado que mais precisa dele, então vai em âmbar ("depende de você").
   */
  semRegistro?: boolean;
  /** Aula `scheduled` em andamento (começou e não terminou): "Agora", não "Agendada". */
  agora?: boolean;
  className?: string;
}

/**
 * O selo de status da aula — um só pro app inteiro, pra que o mesmo estado tenha o mesmo nome e a
 * mesma cor em todas as telas (antes cada tela montava o seu, e a Agenda dizia "Aguardando
 * confirmação" onde o painel dizia "Sem registro").
 *
 * Cor com significado: âmbar = depende de você; neutro com ✓ = feito (não disputa atenção);
 * vermelho = falta/recusa. "Concluída" era dourado e quase não se distinguia do âmbar no selo
 * pequeno (decisão do Lucas, 2026-09-28).
 */
export function StatusBadge({ status, audience = "admin", semRegistro = false, agora = false, className }: StatusBadgeProps) {
  // Mesmo estado, duas vozes: o professor "tem que registrar" (Sem registro); o aluno "espera o registro".
  if (semRegistro)
    return <Badge className={cn("bg-amber/20 text-amber", className)}>{audience === "student" ? "Aguardando registro" : "Sem registro"}</Badge>;
  if (agora) return <Badge className={cn("bg-primary/20 text-[hsl(var(--red-text))]", className)}>Agora</Badge>;
  const cfg = getStatusConfig(status, audience);
  return (
    <Badge className={cn(cfg.badgeClass, "gap-1", className)}>
      {status === "completed" && <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden />}
      {cfg.label}
    </Badge>
  );
}
