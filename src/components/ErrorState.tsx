import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry: () => void;
}

export function ErrorState({
  title = "Não foi possível carregar",
  description = "Verifique sua conexão e tente novamente.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/35 bg-destructive/10 p-6 text-center">
      <div className="text-[14.5px] font-semibold text-destructive/90 mb-1">{title}</div>
      <div className="text-[12.5px] text-muted-foreground mb-3.5">{description}</div>
      <Button size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
