import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, back, action, className }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className={cn("flex items-center gap-3 mb-4", className)}>
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="h-10 w-10 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="page-title truncate">{title}</div>
        {subtitle && <div className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
