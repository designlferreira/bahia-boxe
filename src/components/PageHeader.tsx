import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  /** Substitui o "voltar" padrão (navigate(-1)) — para telas que precisam confirmar antes (formulário com alterações). */
  onBack?: () => void;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, back, onBack, action, className }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className={cn("flex items-center gap-3 mb-4", className)}>
      {back && (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate(-1))}
          aria-label="Voltar"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-[18px] w-[18px] text-foreground" aria-hidden />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
