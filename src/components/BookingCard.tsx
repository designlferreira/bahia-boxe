import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

interface BookingCardProps {
  dayNumber?: string;
  monthLabel?: string;
  title: string;
  subtitle?: string;
  status: string;
  onClick?: () => void;
  actions?: ReactNode;
  highlight?: boolean;
  /** Rótulo de destaque ("Próxima aula"): o cartão ganha o tom dourado, título maior e o rótulo acima. */
  destaque?: string;
  /** Nome falado do cartão (leitor de tela): sem ele o cartão só fala o texto que mostra. */
  ariaLabel?: string;
  /** Aula agendada cujo horário já passou (o professor ainda não registrou) / em andamento — ver StatusBadge. */
  semRegistro?: boolean;
  agora?: boolean;
}

/** Card de aula: data/hora, badge de status, ações contextuais (aluno x admin). */
export function BookingCard({
  dayNumber,
  monthLabel,
  title,
  subtitle,
  status,
  onClick,
  actions,
  highlight,
  destaque,
  ariaLabel,
  semRegistro,
  agora,
}: BookingCardProps) {
  // Hoje só usado pelo histórico do aluno — rótulos na voz do aluno.
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={ariaLabel && destaque === "Próxima aula" ? `${destaque}. ${ariaLabel}` : ariaLabel}
      className={cn(
        "w-full text-left card-dark p-3.5 flex items-center gap-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onClick && "active:scale-[0.985] cursor-pointer hover:border-muted-foreground/40",
        highlight && "border-amber/35",
        destaque && "border-accent/40 bg-[linear-gradient(150deg,hsl(var(--accent)/0.09),hsl(var(--card))_60%)] p-4",
      )}
    >
      {dayNumber && (
        <div className="w-[46px] text-center shrink-0">
          <div className="font-display text-2xl leading-none text-foreground">{dayNumber}</div>
          {monthLabel && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">{monthLabel}</div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {destaque && <div className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">{destaque}</div>}
        <div className={cn("font-semibold text-foreground leading-snug line-clamp-2 break-words", destaque ? "text-[17px]" : "text-[14.5px]")}>{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        <StatusBadge status={status} audience="student" semRegistro={semRegistro} agora={agora} className="mt-1.5" />
        {actions && <div className="flex gap-2 mt-3">{actions}</div>}
      </div>
      {onClick && !actions && <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" aria-hidden />}
    </Wrapper>
  );
}
