import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/SkeletonCard";
import { acceptInvite, validateInvite } from "@/integrations/backend/api";
import { signInAsProfile } from "@/integrations/backend/auth";

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => validateInvite(token!),
    enabled: !!token,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setLoading(true);
    const profileId = await acceptInvite(token, name.trim());
    signInAsProfile(profileId);
    navigate("/app/home", { replace: true });
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex flex-col justify-center bg-background px-6">
        <SkeletonCard height={220} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="font-display text-2xl tracking-wide text-foreground mb-1.5">CONVITE INVÁLIDO</div>
        <p className="text-[13.5px] text-muted-foreground">Esse link de convite expirou ou já foi utilizado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center bg-background px-6">
      <div className="font-display text-3xl tracking-wide text-foreground mb-1.5">VOCÊ FOI CONVIDADO</div>
      <p className="text-[13.5px] text-muted-foreground mb-6">
        {data.adminName} está te convidando para gerenciar suas aulas no Bahia Boxe.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div>
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
        </div>
        <Button type="submit" size="lg" className="mt-1.5" disabled={loading || !name.trim()}>
          {loading ? "Entrando…" : "Aceitar convite"}
        </Button>
      </form>
    </div>
  );
}
