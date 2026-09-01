import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changePassword, AuthError } from "@/integrations/backend/auth";

export default function AlterarSenha({ backTo }: { backTo: string }) {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ruleLen = next.length >= 8;
  const ruleNum = /\d/.test(next);
  const ruleUp = /[A-Z]/.test(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && ruleLen && ruleNum && ruleUp && next === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
      toast.success("Senha alterada com sucesso");
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Não foi possível alterar a senha.");
      toast.error("Não foi possível alterar a senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="ALTERAR SENHA" back />

      {!done ? (
        <div className="card-dark p-[18px]">
          <div className="flex justify-between items-center mb-1.5">
            <Label htmlFor="current" className="mb-0">
              Senha atual
            </Label>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="text-accent text-xs font-semibold flex items-center gap-1"
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <Input
            id="current"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setError(null);
            }}
            placeholder="Sua senha de hoje"
            className="mb-3.5"
            aria-invalid={!!error}
            aria-describedby={error ? "current-error" : undefined}
          />

          <Label htmlFor="next">Nova senha</Label>
          <Input
            id="next"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="mb-3"
          />
          <div className="flex flex-col gap-1.5 mb-3.5">
            <Rule ok={ruleLen} label="Pelo menos 8 caracteres" />
            <Rule ok={ruleNum} label="Pelo menos 1 número" />
            <Rule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
          </div>

          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "confirm-mismatch" : undefined}
          />
          {mismatch && (
            <div id="confirm-mismatch" role="alert" className="text-[12.5px] text-destructive mt-2">
              As senhas não coincidem.
            </div>
          )}

          {error && (
            <div id="current-error" role="alert" className="mt-3.5 rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Button type="submit" size="lg" className="w-full mt-4" disabled={!canSubmit || loading}>
              {loading ? "Salvando…" : "Alterar senha"}
            </Button>
          </form>
          <div className="text-center text-xs text-muted-foreground mt-2.5">Demo: a senha atual é 123456</div>
        </div>
      ) : (
        <div className="card-dark border-accent/30 p-7 text-center animate-bb-up">
          <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
            <CheckCircle2 className="h-[26px] w-[26px] text-accent" />
          </div>
          <div className="font-display text-2xl tracking-wide text-foreground mb-1.5">SENHA ALTERADA</div>
          <p className="text-[13.5px] text-muted-foreground mb-5">
            Sua nova senha já está valendo. Use-a no próximo login.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate(backTo)}>
            Voltar para a conta
          </Button>
        </div>
      )}
    </div>
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
