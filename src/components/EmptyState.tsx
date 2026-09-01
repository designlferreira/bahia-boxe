import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  dashed?: boolean;
}

/** Único padrão de estado vazio da aplicação. */
export function EmptyState({ icon: Icon, title, description, ctaLabel, onCta, dashed = true }: EmptyStateProps) {
  return (
    <div className={dashed ? "rounded-2xl border border-dashed border-border p-8 text-center" : "card-dark p-8 text-center"}>
      {Icon && (
        <div className="mx-auto mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-secondary">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="text-[14.5px] font-semibold text-foreground mb-1">{title}</div>
      <div className="text-[12.5px] text-muted-foreground mb-3.5">{description}</div>
      {ctaLabel && onCta && (
        <Button size="sm" onClick={onCta}>
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
