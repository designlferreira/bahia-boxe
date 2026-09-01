import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setEmailError("Informe seu e-mail.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Informe um e-mail válido.");
      return;
    }
    setEmailError(null);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSent(true);
  }

  return (
    <main className="min-h-dvh flex flex-col bg-background px-6 pt-14">
      <PageHeader title="RECUPERAR SENHA" back={false} />
      <Link to="/login" className="inline-flex min-h-11 items-center text-[13px] text-muted-foreground -mt-2 mb-1 -ml-1 pl-1">
        ← Voltar para o login
      </Link>

      {!sent ? (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
          <p className="text-[13.5px] text-muted-foreground -mt-2 mb-1">
            Digite o e-mail da sua conta e enviaremos um link para redefinir sua senha.
          </p>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder="voce@bahiaboxe.com"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <div id="email-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
                {emailError}
              </div>
            )}
          </div>
          <Button type="submit" size="lg" className="mt-1.5" disabled={loading}>
            {loading ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      ) : (
        <div className="card-dark p-7 text-center animate-bb-up">
          <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-accent" />
          </div>
          <div className="font-display text-2xl tracking-wide text-foreground mb-1.5">LINK ENVIADO</div>
          <p className="text-[13.5px] text-muted-foreground mb-5">
            Se {email} estiver cadastrado, você vai receber um link para redefinir sua senha.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/login">Voltar para o login</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
