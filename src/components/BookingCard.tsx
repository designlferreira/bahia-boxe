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
}: BookingCardProps) {
  // Hoje só usado pelo histórico do aluno — rótulos na voz do aluno.
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full text-left card-dark p-3.5 flex items-center gap-3 transition-all duration-200",
        onClick && "active:scale-[0.985] cursor-pointer hover:border-muted-foreground/40",
        highlight && "border-amber/35",
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
        <div className="text-[14.5px] font-semibold text-foreground leading-snug line-clamp-2 break-words">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        <StatusBadge status={status} audience="student" className="mt-1.5" />
        {actions && <div className="flex gap-2 mt-3">{actions}</div>}
      </div>
      {onClick && !actions && <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" />}
    </Wrapper>
  );
}
