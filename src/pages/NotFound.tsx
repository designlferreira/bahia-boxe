import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center bg-background">
      <h1 className="font-display text-5xl tracking-wide text-foreground">404</h1>
      <p className="text-sm text-muted-foreground max-w-xs">Essa página não existe ou foi movida.</p>
      <Button asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
