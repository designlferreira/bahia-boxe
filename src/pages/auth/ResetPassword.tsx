import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { PasswordRule } from "@/components/PasswordRule";
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
  const [showPassword, setShowPassword] = useState(false);
  const linkInvalidoRef = useRef<HTMLDivElement>(null);

  // Ao descobrir que o link não vale, leva o foco ao aviso: quem usa teclado ou leitor de tela não fica num corpo de página vazio.
  useEffect(() => {
    if (fase === "invalido") linkInvalidoRef.current?.focus();
  }, [fase]);

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
      <main className="min-h-dvh flex flex-col bg-background px-6 pt-14" aria-busy="true">
        <PageHeader title="NOVA SENHA" />
        <p role="status" className="sr-only">
          Verificando o link…
        </p>
        <div aria-hidden>
          <SkeletonCard height={200} />
        </div>
      </main>
    );
  }

  if (fase === "invalido") {
    return (
      <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
        <PageHeader title="LINK EXPIRADO" />
        <div ref={linkInvalidoRef} tabIndex={-1} className="card-dark p-6 text-center focus:outline-none">
          <p role="alert" className="text-[13.5px] text-muted-foreground mb-5">
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
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="next" className="mb-0">
              Nova senha
            </Label>
            {/* Como no Login e no Criar conta: digitar às cegas no celular é o jeito de errar a senha nova. */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              className="text-accent text-xs font-semibold flex items-center gap-1 min-h-11 px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <Input
            id="next"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Mínimo 8 caracteres"
            aria-describedby="regras-senha"
          />
          <div id="regras-senha" className="flex flex-col gap-1.5 mt-2">
            <PasswordRule ok={ruleLen} label="Pelo menos 8 caracteres" />
            <PasswordRule ok={ruleNum} label="Pelo menos 1 número" />
            <PasswordRule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
          </div>
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "confirm-error" : undefined}
          />
          {mismatch && (
            <div id="confirm-error" role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-2">
              As senhas não coincidem.
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-3 text-[13px] text-[hsl(var(--red-text))]">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" className="mt-1.5" disabled={!canSubmit || loading} aria-describedby={!canSubmit ? "submit-dica" : undefined}>
          {loading ? "Salvando…" : "Redefinir senha"}
        </Button>
        {/* Botão desativado explica o porquê (como no Criar conta). */}
        {!canSubmit && !loading && (
          <div id="submit-dica" className="text-center text-[13px] text-muted-foreground -mt-1">
            {mismatch ? "As duas senhas precisam ser iguais." : "Siga as regras da senha e repita a mesma senha para continuar."}
          </div>
        )}
        {/* Sem botão de voltar (a página abre em outra aba, vinda do e-mail): antes a única saída era concluir. */}
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link to="/login">Voltar para o login</Link>
        </Button>
      </form>
    </main>
  );
}
