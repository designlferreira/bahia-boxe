import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/SkeletonCard";
import { acceptInvite, validateInvite } from "@/integrations/backend/api";
import { supabase } from "@/integrations/supabase/client";

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => validateInvite(token!),
    enabled: !!token,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (signUpError) throw signUpError;
      await acceptInvite(token);
      navigate("/app/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aceitar o convite.");
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

  if (!data) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-2xl tracking-wide text-foreground mb-1.5">CONVITE INVÁLIDO</h1>
        <p className="text-[13.5px] text-muted-foreground">Esse link de convite expirou ou já foi utilizado.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-background px-6">
      <h1 className="font-display text-3xl tracking-wide text-foreground mb-1.5">VOCÊ FOI CONVIDADO</h1>
      <p className="text-[13.5px] text-muted-foreground mb-6">
        {data.adminName} está te convidando para gerenciar suas aulas no Bahia Boxe.
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
          <div role="alert" className="text-[12.5px] text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" className="mt-1.5" disabled={loading || !name.trim() || !email.trim() || password.length < 8}>
          {loading ? "Entrando…" : "Aceitar convite"}
        </Button>
      </form>
    </main>
  );
}
