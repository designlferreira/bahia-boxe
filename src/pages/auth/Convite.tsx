import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/SkeletonCard";
import { acceptInvite, validateInvite } from "@/integrations/backend/api";
import { AuthError, signUpWithPassword } from "@/integrations/backend/auth";
import { guardarConvitePendente, limparConvitePendente } from "@/lib/convitePendente";
import { useAuth } from "@/context/AuthContext";

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [contaExiste, setContaExiste] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => validateInvite(token!),
    enabled: !!token,
    retry: false,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || loading) return;
    setLoading(true);
    setError(null);
    setContaExiste(false);
    try {
      // O MESMO cadastro da tela "Criar conta": ele sabe o que fazer quando o Supabase exige
      // confirmação de e-mail (a conta nasce SEM sessão) e traduz os erros. Antes o convite chamava o
      // Supabase direto e seguia para `accept_invite` sem sessão — falhava no meio, deixando conta
      // criada e convite não usado.
      const result = await signUpWithPassword(name, email, password);
      if (result.status === "needs_confirmation") {
        // Guarda o convite: quem o conclui é o AuthProvider, quando a sessão existir.
        guardarConvitePendente(token);
        navigate(`/confirmar-email?email=${encodeURIComponent(result.email)}&convite=1`, { replace: true });
        return;
      }
      await acceptInvite(token);
      limparConvitePendente();
      refreshProfile();
      navigate("/app/home", { replace: true });
    } catch (err) {
      if (err instanceof AuthError && err.message.startsWith("Já existe uma conta")) {
        // Quem já tem conta entra e o convite é concluído no login (mesmo mecanismo).
        guardarConvitePendente(token);
        setContaExiste(true);
      }
      setError(err instanceof AuthError ? err.message : "Não foi possível aceitar o convite. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-dvh flex flex-col justify-center bg-background px-6">
        <SkeletonCard height={220} />
      </main>
    );
  }

  // Falha de conexão NÃO é convite inválido: antes a query com erro caía aqui e o aluno lia
  // "CONVITE INVÁLIDO" por causa de um sinal de internet ruim.
  if (isError) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-2xl tracking-wide text-foreground mb-1.5">SEM CONEXÃO</h1>
        <p className="text-[13.5px] text-muted-foreground mb-5">Não conseguimos verificar seu convite agora.</p>
        <Button size="lg" onClick={() => refetch()}>
          Tentar de novo
        </Button>
      </main>
    );
  }

  if (!data || !data.valid) {
    // `reason` vem do banco (validate_invite não está neste repositório): usado só pra escolher a
    // frase, com uma genérica quando não reconhece o valor.
    const motivo = data?.reason ?? "";
    const frase = /expir/i.test(motivo)
      ? "Esse link de convite expirou."
      : /used|usad|accept|consum/i.test(motivo)
        ? "Esse link de convite já foi utilizado."
        : "Esse link de convite expirou ou já foi utilizado.";
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-2xl tracking-wide text-foreground mb-1.5">CONVITE INVÁLIDO</h1>
        <p className="text-[13.5px] text-muted-foreground mb-1">{frase}</p>
        <p className="text-[13.5px] text-muted-foreground mb-5">Peça um novo link ao seu professor.</p>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Já tenho conta · Entrar
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-background px-6">
      <h1 className="font-display text-3xl tracking-wide text-foreground mb-1.5">VOCÊ FOI CONVIDADO</h1>
      <p className="text-[13.5px] text-muted-foreground mb-6">
        Seu professor está te convidando para gerenciar suas aulas no Bahia Boxe.
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
        <div>
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
        </div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </div>
        <div>
          <Label htmlFor="password">Crie uma senha</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        {error && (
          <div role="alert" className="rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-destructive">
            {error}
            {contaExiste && (
              <>
                {" "}
                <Link to="/login" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  Entrar com esta conta
                </Link>
              </>
            )}
          </div>
        )}
        <Button type="submit" size="lg" className="mt-1.5" disabled={loading || !name.trim() || !email.trim() || password.length < 8}>
          {loading ? "Criando conta…" : "Aceitar convite"}
        </Button>
      </form>
    </main>
  );
}
