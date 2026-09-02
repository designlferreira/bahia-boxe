import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthError, signUpWithPassword } from "@/integrations/backend/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export default function CriarConta() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (profile) {
    return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
  }

  const ruleLen = password.length >= MIN_PASSWORD;
  const ruleNum = /\d/.test(password);
  const ruleUp = /[A-Z]/.test(password);
  const canSubmit =
    name.trim().length > 0 && EMAIL_RE.test(email.trim()) && ruleLen && ruleNum && ruleUp && password === confirm;

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Informe seu nome completo.";
    if (!email.trim()) errors.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "Digite um e-mail válido.";
    if (!password) errors.password = "Crie uma senha.";
    else if (!ruleLen || !ruleNum || !ruleUp) errors.password = "A senha não atende aos requisitos abaixo.";
    if (confirm !== password) errors.confirm = "As senhas não coincidem.";

    setFieldErrors(errors);
    if (errors.name) nameRef.current?.focus();
    else if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    else if (errors.confirm) confirmRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return; // guards a double tap on the CTA
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await signUpWithPassword(name, email, password);
      if (result.status === "needs_confirmation") {
        navigate(`/confirmar-email?email=${encodeURIComponent(result.email)}`, { replace: true });
        return;
      }
      if (result.status === "profile_missing") {
        setError("Conta criada, mas seu perfil ainda não está configurado. Fale com o professor.");
        return;
      }
      refreshProfile();
      navigate(result.profile.role === "admin" ? "/admin/dashboard" : "/app/home", { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Não foi possível criar sua conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-gradient-to-b from-primary/20 to-background px-6 py-10">
      <h1 className="font-display text-[38px] leading-[0.95] tracking-wide text-foreground mb-1.5">CRIAR CONTA</h1>
      <p className="text-[13.5px] text-muted-foreground mb-6">Leva menos de um minuto.</p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
        <div>
          <Label htmlFor="name">Nome completo</Label>
          <Input
            id="name"
            ref={nameRef}
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
            }}
            onBlur={(e) => {
              setFieldErrors((f) => ({ ...f, name: e.target.value.trim() ? undefined : "Informe seu nome completo." }));
            }}
            placeholder="Seu nome"
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
          />
          {fieldErrors.name && (
            <div id="name-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
              {fieldErrors.name}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const err = !v ? undefined : !EMAIL_RE.test(v) ? "Digite um e-mail válido." : undefined;
              setFieldErrors((f) => ({ ...f, email: err }));
            }}
            placeholder="voce@email.com"
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email && (
            <div id="email-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
              {fieldErrors.email}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password" className="mb-0">
              Senha
            </Label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-accent text-xs font-semibold flex items-center gap-1 min-h-11 px-1"
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <Input
            id="password"
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            placeholder="Mínimo 8 caracteres"
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "password-error" : "password-rules"}
          />
          <div id="password-rules" className="flex flex-col gap-1.5 mt-2">
            <Rule ok={ruleLen} label="Pelo menos 8 caracteres" />
            <Rule ok={ruleNum} label="Pelo menos 1 número" />
            <Rule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
          </div>
          {fieldErrors.password && (
            <div id="password-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
              {fieldErrors.password}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            ref={confirmRef}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (fieldErrors.confirm) setFieldErrors((f) => ({ ...f, confirm: undefined }));
            }}
            onBlur={(e) => {
              const v = e.target.value;
              setFieldErrors((f) => ({ ...f, confirm: v && v !== password ? "As senhas não coincidem." : undefined }));
            }}
            placeholder="Repita a senha"
            aria-invalid={!!fieldErrors.confirm}
            aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
          />
          {fieldErrors.confirm && (
            <div id="confirm-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
              {fieldErrors.confirm}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="mt-1.5" disabled={!canSubmit || loading}>
          {loading ? "Criando conta…" : "Criar conta"}
        </Button>
      </form>

      <div className="text-center text-[13px] text-muted-foreground mt-4">
        <Link to="/login" className="inline-flex min-h-11 items-center hover:text-foreground">
          Já tenho uma conta
        </Link>
      </div>
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
