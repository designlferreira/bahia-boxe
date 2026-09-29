import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/integrations/backend/types";
import { TelaDeAbertura } from "@/components/TelaDeAbertura";

interface ProtectedRouteProps {
  allowedRoles: Role[];
}

/**
 * Quem abre uma rota do OUTRO papel (aluno em /admin/..., professor em /app/...) é mandado para a própria home. Antes era em silêncio: o link
 * parecia "não ter feito nada". Agora um aviso curto explica. Neutro (`toast`), não âmbar/vermelho: não é erro de quem abriu.
 */
function RedirecionaPapelErrado({ para }: { para: string }) {
  useEffect(() => {
    // `id` fixo: em desenvolvimento (StrictMode) o efeito roda duas vezes e o aviso sairia repetido.
    toast("Esse endereço não é para o seu tipo de conta.", { id: "papel-errado" });
  }, []);
  return <Navigate to={para} replace />;
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { profile, loading } = useAuth();

  // Tela de abertura, não uma tela vazia: abrir direto uma rota protegida (o app instalado reabre onde parou) mostrava só o fundo.
  if (loading) return <TelaDeAbertura />;
  if (!profile) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(profile.role)) {
    return <RedirecionaPapelErrado para={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} />;
  }
  return <Outlet />;
}
