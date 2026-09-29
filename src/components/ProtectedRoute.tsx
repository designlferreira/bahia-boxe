import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/integrations/backend/types";
import { TelaDeAbertura } from "@/components/TelaDeAbertura";

interface ProtectedRouteProps {
  allowedRoles: Role[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { profile, loading } = useAuth();

  // Tela de abertura, não uma tela vazia: abrir direto uma rota protegida (o app instalado reabre onde parou) mostrava só o fundo.
  if (loading) return <TelaDeAbertura />;
  if (!profile) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
  }
  return <Outlet />;
}
