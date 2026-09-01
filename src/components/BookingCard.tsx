import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/lib/bookingStatus";
import { cn } from "@/lib/utils";

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
  const cfg = getStatusConfig(status);
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
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mt-0.5">{monthLabel}</div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold text-foreground truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        <Badge className={cn(cfg.badgeClass, "mt-1.5")}>{cfg.label}</Badge>
        {actions && <div className="flex gap-2 mt-3">{actions}</div>}
      </div>
      {onClick && !actions && <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" />}
    </Wrapper>
  );
}
