import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentLayout } from "@/layouts/StudentLayout";
import { AdminLayout } from "@/layouts/AdminLayout";

import Login from "@/pages/auth/Login";
import CriarConta from "@/pages/auth/CriarConta";
import ConfirmarEmail from "@/pages/auth/ConfirmarEmail";
import RecuperarSenha from "@/pages/auth/RecuperarSenha";
import ResetPassword from "@/pages/auth/ResetPassword";
import Convite from "@/pages/auth/Convite";
import NotFound from "@/pages/NotFound";

import StudentHome from "@/pages/student/Home";
import StudentAgendar from "@/pages/student/Agendar";
import StudentHistorico from "@/pages/student/Historico";
import StudentAulaDetalhe from "@/pages/student/AulaDetalhe";
import StudentPacotes from "@/pages/student/Pacotes";
import StudentMinhaConta from "@/pages/student/MinhaConta";
import StudentPerfil from "@/pages/student/Perfil";
import StudentPerfilLutador from "@/pages/student/PerfilLutador";
import StudentPerfilLutadorQuestionario from "@/pages/student/PerfilLutadorQuestionario";
import StudentPerfilLutadorResultado from "@/pages/student/PerfilLutadorResultado";
import StudentPerfilLutadorHistorico from "@/pages/student/PerfilLutadorHistorico";
import StudentPerfilLutadorComparacao from "@/pages/student/PerfilLutadorComparacao";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminAgenda from "@/pages/admin/Agenda";
import AdminAulaDetalhe from "@/pages/admin/AulaDetalhe";
import AdminAlunos from "@/pages/admin/Alunos";
import AdminAlunoDetalhe from "@/pages/admin/AlunoDetalhe";
import AdminAlunoPerfilBoxe from "@/pages/admin/AlunoPerfilBoxe";
import AdminAlunoPerfilBoxeQuestionario from "@/pages/admin/AlunoPerfilBoxeQuestionario";
import AdminHistorico from "@/pages/admin/Historico";
import AdminPedidos from "@/pages/admin/Pedidos";
import AdminPacotes from "@/pages/admin/Pacotes";
import AdminDisponibilidade from "@/pages/admin/Disponibilidade";
import AdminOrientacoesAula from "@/pages/admin/OrientacoesAula";
import AdminPerfilAlunos from "@/pages/admin/PerfilAlunos";
import AdminConfiguracoes from "@/pages/admin/Configuracoes";
import AdminMinhaConta from "@/pages/admin/MinhaConta";

import AlterarSenha from "@/pages/shared/AlterarSenha";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function PostLoginRedirect() {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PostLoginRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/criar-conta" element={<CriarConta />} />
      <Route path="/confirmar-email" element={<ConfirmarEmail />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/convite/:token" element={<Convite />} />

      <Route element={<ProtectedRoute allowedRoles={["student"]} />}>
        <Route element={<StudentLayout />}>
          <Route path="/app/home" element={<StudentHome />} />
          <Route path="/app/agendar" element={<StudentAgendar />} />
          <Route path="/app/historico" element={<StudentHistorico />} />
          <Route path="/app/aula/:id" element={<StudentAulaDetalhe />} />
          <Route path="/app/pacotes" element={<StudentPacotes />} />
          <Route path="/app/minha-conta" element={<StudentMinhaConta />} />
          <Route path="/app/minha-conta/perfil" element={<StudentPerfil />} />
          <Route path="/app/perfil-lutador" element={<StudentPerfilLutador />} />
          <Route path="/app/perfil-lutador/questionario" element={<StudentPerfilLutadorQuestionario />} />
          <Route path="/app/perfil-lutador/resultado/:id" element={<StudentPerfilLutadorResultado />} />
          <Route path="/app/perfil-lutador/historico" element={<StudentPerfilLutadorHistorico />} />
          <Route path="/app/perfil-lutador/comparacao" element={<StudentPerfilLutadorComparacao />} />
          <Route path="/app/minha-conta/alterar-senha" element={<AlterarSenha backTo="/app/minha-conta" />} />
          <Route path="/app/minhas-aulas" element={<Navigate to="/app/historico" replace />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/agenda" element={<AdminAgenda />} />
          <Route path="/admin/aula/:id" element={<AdminAulaDetalhe />} />
          <Route path="/admin/alunos" element={<AdminAlunos />} />
          <Route path="/admin/alunos/:studentId" element={<AdminAlunoDetalhe />} />
          <Route path="/admin/alunos/:studentId/perfil-lutador" element={<AdminAlunoPerfilBoxe />} />
          <Route path="/admin/alunos/:studentId/perfil-lutador/questionario" element={<AdminAlunoPerfilBoxeQuestionario />} />
          <Route path="/admin/historico" element={<AdminHistorico />} />
          <Route path="/admin/pacotes" element={<AdminPacotes />} />
          <Route path="/admin/solicitacoes" element={<AdminPedidos />} />
          <Route path="/admin/disponibilidade" element={<AdminDisponibilidade />} />
          <Route path="/admin/orientacoes" element={<AdminOrientacoesAula />} />
          <Route path="/admin/perfil-alunos" element={<AdminPerfilAlunos />} />
          <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
          <Route path="/admin/minha-conta" element={<AdminMinhaConta />} />
          <Route path="/admin/minha-conta/alterar-senha" element={<AlterarSenha backTo="/admin/minha-conta" />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          position="bottom-center"
          offset={84}
          toastOptions={{
            classNames: {
              toast: "!bg-[#1E1E1E] !border !border-[#343434] !text-foreground !rounded-2xl",
              actionButton: "!bg-[#262626] !text-accent",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
