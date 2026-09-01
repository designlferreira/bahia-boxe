import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ResetPassword() {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const ruleLen = next.length >= 8;
  const ruleNum = /\d/.test(next);
  const ruleUp = /[A-Z]/.test(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = ruleLen && ruleNum && ruleUp && next === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-accent" />
        </div>
        <h1 className="font-display text-2xl tracking-wide text-foreground mb-1.5">SENHA REDEFINIDA</h1>
        <p className="text-[13.5px] text-muted-foreground mb-5 max-w-xs">
          Sua senha foi alterada. Use-a no próximo login.
        </p>
        <Button asChild size="lg">
          <Link to="/login">Ir para o login</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
      <PageHeader title="NOVA SENHA" />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
        <div>
          <Label htmlFor="next">Nova senha</Label>
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div className="flex flex-col gap-1.5 -mt-1">
          <Rule ok={ruleLen} label="Pelo menos 8 caracteres" />
          <Rule ok={ruleNum} label="Pelo menos 1 número" />
          <Rule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "confirm-error" : undefined}
          />
          {mismatch && (
            <div id="confirm-error" role="alert" className="text-[12.5px] text-destructive mt-2">
              As senhas não coincidem.
            </div>
          )}
        </div>
        <Button type="submit" size="lg" className="mt-1.5" disabled={!canSubmit || loading}>
          {loading ? "Salvando…" : "Redefinir senha"}
        </Button>
      </form>
    </main>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-accent" : "text-muted-foreground"}`}>
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {label}
    </div>
  );
}
