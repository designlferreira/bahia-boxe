import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthError, resendConfirmationEmail } from "@/integrations/backend/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { profile, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // E-mail não confirmado: a tela oferece reenviar o link (o mesmo do "Confirme seu e-mail").
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [reenvio, setReenvio] = useState<{ ok: boolean; texto: string } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (profile) {
    return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
  }

  function validate() {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "Informe um e-mail válido.";
    if (!password) errors.password = "Informe sua senha.";
    setFieldErrors(errors);
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  async function reenviar() {
    if (reenviando) return;
    setReenviando(true);
    setReenvio(null);
    try {
      await resendConfirmationEmail(email);
      setReenvio({ ok: true, texto: "E-mail reenviado. Confira sua caixa de entrada e o spam." });
    } catch (err) {
      setReenvio({ ok: false, texto: err instanceof AuthError ? err.message : "Não foi possível reenviar agora. Tente de novo." });
    } finally {
      setReenviando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNaoConfirmado(false);
    setReenvio(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setNaoConfirmado(err instanceof AuthError && err.code === "email_not_confirmed");
      setError(err instanceof AuthError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-gradient-to-b from-primary/20 to-background px-6 pt-10 pb-10">
      <div>
        <div className="flex items-center gap-3 mb-10">
          <div className="h-11 w-11 rounded-2xl bg-gradient-hero shadow-glow flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M7 5h8a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H9" />
              <path d="M7 5v11a3 3 0 0 0 3 3h5" />
            </svg>
          </div>
          <div>
            <div className="font-display text-3xl leading-none tracking-wide text-foreground">BAHIA BOXE</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">Gestão de aulas</div>
          </div>
        </div>

        <h1 className="font-display text-[44px] leading-[0.95] tracking-wide text-foreground mb-5">
          SEU RINGUE,
          <br />
          SUA AGENDA.
        </h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 mt-auto">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            placeholder="voce@bahiaboxe.com"
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
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
              placeholder="••••••••"
              className="pr-11"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
          {fieldErrors.password && (
            <div id="password-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
              {fieldErrors.password}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-destructive">
            {error}
            {naoConfirmado && (
              <div className="mt-2.5">
                <Button type="button" variant="secondary" size="sm" onClick={reenviar} disabled={reenviando}>
                  {reenviando ? "Reenviando…" : "Reenviar e-mail de confirmação"}
                </Button>
              </div>
            )}
          </div>
        )}
        {reenvio && (
          <div role="status" className={`text-[13px] ${reenvio.ok ? "text-accent" : "text-destructive"}`}>
            {reenvio.texto}
          </div>
        )}

        <Button type="submit" size="lg" className="mt-1.5" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="text-center text-[13px] text-muted-foreground mt-4">
        <Link
          to="/recuperar-senha"
          className="inline-flex min-h-11 items-center hover:text-foreground"
        >
          Esqueceu a senha? Recuperar
        </Link>
      </div>

      <div className="flex items-center gap-3 my-2">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="text-center text-[13px] text-muted-foreground">
        Ainda não tem uma conta?{" "}
        <Link to="/criar-conta" className="inline-flex min-h-11 items-center font-semibold text-accent hover:text-foreground">
          Criar conta
        </Link>
      </div>
    </main>
  );
}
