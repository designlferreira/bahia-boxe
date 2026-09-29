import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AuthError,
  estadoDoLinkDeRecuperacao,
  redefinirSenhaPeloLink,
  temSessaoDeRecuperacao,
} from "@/integrations/backend/auth";

type Fase = "verificando" | "pronto" | "invalido";

/**
 * Tela aberta pelo link do e-mail de recuperação. Antes era uma maquete (esperava 0,7s e dizia "SENHA REDEFINIDA" sem alterar nada);
 * agora só mostra o formulário quando o link virou uma sessão de recuperação, e redefine de verdade. `amostra` só existe para a
 * página de amostras de desenvolvimento (`src/dev/Amostras.tsx`) mostrar cada fase sem um link real.
 */
export default function ResetPassword({ amostra }: { amostra?: Fase }) {
  const navigate = useNavigate();
  const [fase, setFase] = useState<Fase>(amostra ?? "verificando");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (amostra) return;
    let ativo = true;
    // Aberta sem um link de recuperação válido (digitando o endereço, link com erro/expirado): não há o que redefinir.
    if (estadoDoLinkDeRecuperacao() !== "recovery") {
      setFase("invalido");
      return;
    }
    temSessaoDeRecuperacao()
      .then((ok) => ativo && setFase(ok ? "pronto" : "invalido"))
      .catch(() => ativo && setFase("invalido"));
    return () => {
      ativo = false;
    };
  }, [amostra]);

  const ruleLen = next.length >= 8;
  const ruleNum = /\d/.test(next);
  const ruleUp = /[A-Z]/.test(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = ruleLen && ruleNum && ruleUp && next === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      await redefinirSenhaPeloLink(next);
      // A sessão de recuperação foi encerrada: a pessoa entra com a senha nova.
      toast.success("Senha alterada. Entre com a nova senha.");
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.code === "link_expired") {
        setFase("invalido");
      } else {
        setError(err instanceof AuthError ? err.message : "Não foi possível redefinir a senha. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (fase === "verificando") {
    return (
      <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
        <PageHeader title="NOVA SENHA" />
        <SkeletonCard height={200} />
      </main>
    );
  }

  if (fase === "invalido") {
    return (
      <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
        <PageHeader title="LINK EXPIRADO" />
        <div className="card-dark p-6 text-center">
          <p className="text-[13.5px] text-muted-foreground mb-5">
            Este link de recuperação expirou ou já foi usado. Peça um novo link para redefinir sua senha.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/recuperar-senha">Pedir novo link</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full mt-2">
            <Link to="/login">Voltar para o login</Link>
          </Button>
        </div>
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
            onChange={(e) => {
              setNext(e.target.value);
              if (error) setError(null);
            }}
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
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-3 text-[13px] text-[hsl(var(--red-text))]">
            {error}
          </div>
        )}
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
