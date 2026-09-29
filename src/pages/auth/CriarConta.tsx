import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ContaForm } from "@/components/ContaForm";
import { AuthError, signUpWithPassword } from "@/integrations/backend/auth";

export default function CriarConta() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile) {
    return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
  }

  async function handleSubmit({ name, email, password }: { name: string; email: string; password: string }) {
    if (loading) return;
    setError(null);
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

      <ContaForm submitLabel="Criar conta" loadingLabel="Criando conta…" loading={loading} error={error} onSubmit={handleSubmit} />

      <div className="text-center text-[13px] text-muted-foreground mt-4">
        <Link to="/login" className="inline-flex min-h-11 items-center hover:text-foreground">
          Já tenho uma conta
        </Link>
      </div>
    </main>
  );
}
