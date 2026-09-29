import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AuthError, sendPasswordResetEmail } from "@/integrations/backend/auth";

/** Espera antes de poder reenviar (o Supabase também limita; assim a pessoa não fica tocando à toa). */
const ESPERA_REENVIO_S = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `amostraEnviado` (e-mail) só existe para a página de amostras de desenvolvimento mostrar o cartão de "enviado" sem enviar nada. */
export default function RecuperarSenha({ amostraEnviado }: { amostraEnviado?: string }) {
  const [email, setEmail] = useState(amostraEnviado ?? "");
  const [sent, setSent] = useState(!!amostraEnviado);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [espera, setEspera] = useState(amostraEnviado ? 45 : 0);
  const [reenviando, setReenviando] = useState(false);
  const [reenvioMsg, setReenvioMsg] = useState<string | null>(null);
  const tituloEnviadoRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Ao trocar o formulário pelo "LINK ENVIADO" o botão que tinha o foco some: sem isso o foco caía no <body> e o leitor de tela
  // não anunciava nada. Leva o foco ao título do cartão.
  useEffect(() => {
    if (sent) tituloEnviadoRef.current?.focus();
  }, [sent]);

  // Contagem regressiva do "Reenviar".
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Erro de e-mail leva o foco ao campo (o leitor de tela anuncia o erro e a pessoa já está onde corrigir).
    if (!email.trim()) {
      setEmailError("Informe seu e-mail.");
      emailRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Informe um e-mail válido.");
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    setServerError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
      setEspera(ESPERA_REENVIO_S);
      setReenvioMsg(null);
    } catch (err) {
      setServerError(err instanceof AuthError ? err.message : "Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  async function reenviar() {
    if (espera > 0 || reenviando) return;
    setReenviando(true);
    setReenvioMsg(null);
    try {
      await sendPasswordResetEmail(email);
      setEspera(ESPERA_REENVIO_S);
      setReenvioMsg("E-mail reenviado.");
    } catch (err) {
      setReenvioMsg(err instanceof AuthError ? err.message : "Não foi possível reenviar agora. Tente novamente em instantes.");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
      <PageHeader title="RECUPERAR SENHA" back={false} />
      {/* Só no formulário: no cartão de "enviado" já há o botão "Voltar para o login" (eram dois iguais na mesma tela). */}
      {!sent && (
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center text-[13px] text-muted-foreground -mt-2 mb-1 -ml-1 pl-1 pr-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Voltar para o login
        </Link>
      )}

      {!sent ? (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
          <p className="text-[13.5px] text-muted-foreground -mt-2 mb-1">
            Digite o e-mail da sua conta e enviaremos um link para redefinir sua senha.
          </p>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
                if (serverError) setServerError(null);
              }}
              placeholder="voce@email.com"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <div id="email-error" role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-1.5">
                {emailError}
              </div>
            )}
          </div>
          {serverError && (
            <div role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-3.5 py-3 text-[13px] text-[hsl(var(--red-text))]">
              {serverError}
            </div>
          )}
          <Button type="submit" size="lg" className="mt-1.5" disabled={loading}>
            {loading ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      ) : (
        <div role="status" className="card-dark p-7 text-center animate-bb-up">
          <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-accent" aria-hidden />
          </div>
          <h2
            ref={tituloEnviadoRef}
            tabIndex={-1}
            className="font-display text-2xl tracking-wide text-foreground mb-1.5 focus:outline-none"
          >
            LINK ENVIADO
          </h2>
          <p className="text-[13.5px] text-muted-foreground mb-2">
            Se <strong className="font-semibold text-foreground break-all">{email.trim()}</strong> estiver cadastrado, você vai receber um
            e-mail com o link para escolher uma nova senha.
          </p>
          <p className="text-[13px] text-muted-foreground mb-5">
            Não chegou? Olhe a caixa de spam. O link vale por pouco tempo e só funciona uma vez.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/login">Voltar para o login</Link>
          </Button>
          <Button variant="secondary" size="sm" className="w-full mt-2.5" onClick={reenviar} disabled={espera > 0 || reenviando}>
            {reenviando ? "Reenviando…" : espera > 0 ? `Reenviar e-mail em ${espera} s` : "Reenviar e-mail"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1"
            onClick={() => {
              setSent(false);
              setReenvioMsg(null);
              setEspera(0);
            }}
          >
            Usar outro e-mail
          </Button>
          {reenvioMsg && <p className="text-[13px] text-muted-foreground mt-2.5">{reenvioMsg}</p>}
        </div>
      )}
    </main>
  );
}
