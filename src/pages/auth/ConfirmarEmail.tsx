import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthError, resendConfirmationEmail } from "@/integrations/backend/auth";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ConfirmarEmail() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  // Veio de um convite: o convite fica guardado e o AuthProvider o conclui quando houver sessão.
  const doConvite = params.get("convite") === "1";
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    if (sending || cooldown > 0 || !email) return;
    setSending(true);
    setFeedback(null);
    try {
      await resendConfirmationEmail(email);
      setFeedback({ kind: "success", message: "E-mail reenviado. Confira sua caixa de entrada e o spam." });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setFeedback({
        kind: "error",
        message: err instanceof AuthError ? err.message : "Não foi possível reenviar o e-mail. Tente novamente.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-background px-6 py-10">
      <div className="card-dark p-7 text-center animate-bb-up">
        <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
          <MailCheck className="h-6 w-6 text-accent" aria-hidden />
        </div>
        <h1 className="font-display text-2xl tracking-wide text-foreground mb-1.5">CONFIRME SEU E-MAIL</h1>
        <p className="text-sm text-muted-foreground mb-1">Enviamos um link de confirmação para</p>
        <p className="text-[14.5px] font-semibold text-foreground mb-3 break-all">{email || "seu e-mail"}</p>
        <p className="text-sm text-muted-foreground mb-1">Abra o e-mail e toque no link para ativar sua conta.</p>
        <p className="text-sm text-muted-foreground mb-5">Não chegou? Olhe também a caixa de spam.</p>
        {doConvite && (
          <p className="rounded-2xl bg-secondary p-3.5 text-sm text-foreground mb-5">
            Assim que você confirmar, seu convite é concluído sozinho e você já vê suas aulas.
          </p>
        )}

        {feedback && (
          <div
            role="status"
            className={`rounded-2xl border p-3.5 text-[13px] mb-4 ${
              feedback.kind === "success"
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-destructive/35 bg-destructive/10 text-destructive"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* Depois de confirmar, o caminho é entrar — vem primeiro; reenviar é a saída se o e-mail não chegou. */}
        <Button asChild size="lg" className="w-full">
          <Link to="/login">Já confirmei, entrar</Link>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full mt-2.5"
          onClick={handleResend}
          disabled={sending || cooldown > 0 || !email}
        >
          {sending ? "Reenviando…" : cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar e-mail"}
        </Button>

        {!doConvite && (
          <div className="flex flex-col gap-1 mt-4">
            <Link
              to="/criar-conta"
              className="inline-flex min-h-11 items-center justify-center rounded-md text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Usar outro e-mail
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
