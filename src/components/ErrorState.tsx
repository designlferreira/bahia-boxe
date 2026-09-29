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
      <div className="text-[15px] font-semibold text-[hsl(var(--red-text))] mb-1">{title}</div>
      <div className="text-sm text-muted-foreground mb-4">{description}</div>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
