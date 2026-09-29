import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
const StudentLayout = lazy(() => import("@/layouts/StudentLayout").then((m) => ({ default: m.StudentLayout })));
const AdminLayout = lazy(() => import("@/layouts/AdminLayout").then((m) => ({ default: m.AdminLayout })));

const Login = lazy(() => import("@/pages/auth/Login"));
const CriarConta = lazy(() => import("@/pages/auth/CriarConta"));
const ConfirmarEmail = lazy(() => import("@/pages/auth/ConfirmarEmail"));
const RecuperarSenha = lazy(() => import("@/pages/auth/RecuperarSenha"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Convite = lazy(() => import("@/pages/auth/Convite"));
const NotFound = lazy(() => import("@/pages/NotFound"));
import { TelaDeAbertura } from "@/components/TelaDeAbertura";
import { FaixaSemInternet } from "@/components/FaixaSemInternet";
import { FaixaConexaoLenta } from "@/components/FaixaConexaoLenta";
import { AnunciadorDeRota } from "@/components/AnunciadorDeRota";
import { TransicaoDeTela } from "@/components/TransicaoDeTela";
import { TelaSessaoNaoCarregou } from "@/components/TelaSessaoNaoCarregou";

const StudentHome = lazy(() => import("@/pages/student/Home"));
const StudentAgendar = lazy(() => import("@/pages/student/Agendar"));
const StudentHistorico = lazy(() => import("@/pages/student/Historico"));
const StudentAulaDetalhe = lazy(() => import("@/pages/student/AulaDetalhe"));
const StudentPacotes = lazy(() => import("@/pages/student/Pacotes"));
const StudentMinhaConta = lazy(() => import("@/pages/student/MinhaConta"));
const StudentPerfil = lazy(() => import("@/pages/student/Perfil"));
const StudentPerfilLutador = lazy(() => import("@/pages/student/PerfilLutador"));
const StudentPerfilLutadorQuestionario = lazy(() => import("@/pages/student/PerfilLutadorQuestionario"));
const StudentPerfilLutadorResultado = lazy(() => import("@/pages/student/PerfilLutadorResultado"));
const StudentPerfilLutadorHistorico = lazy(() => import("@/pages/student/PerfilLutadorHistorico"));

const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminAgenda = lazy(() => import("@/pages/admin/Agenda"));
const AdminAulaDetalhe = lazy(() => import("@/pages/admin/AulaDetalhe"));
const AdminAlunos = lazy(() => import("@/pages/admin/Alunos"));
const AdminAlunoDetalhe = lazy(() => import("@/pages/admin/AlunoDetalhe"));
const AdminAlunoPerfilBoxe = lazy(() => import("@/pages/admin/AlunoPerfilBoxe"));
const AdminAlunoPerfilBoxeQuestionario = lazy(() => import("@/pages/admin/AlunoPerfilBoxeQuestionario"));
const AdminAlunoRecorrencia = lazy(() => import("@/pages/admin/AlunoRecorrencia"));
const AdminHistorico = lazy(() => import("@/pages/admin/Historico"));
const AdminPedidos = lazy(() => import("@/pages/admin/Pedidos"));
const AdminPacotes = lazy(() => import("@/pages/admin/Pacotes"));
const AdminDisponibilidade = lazy(() => import("@/pages/admin/Disponibilidade"));
const AdminOrientacoesAula = lazy(() => import("@/pages/admin/OrientacoesAula"));
const AdminPerfilAlunos = lazy(() => import("@/pages/admin/PerfilAlunos"));
const AdminConfiguracoes = lazy(() => import("@/pages/admin/Configuracoes"));
const AdminMinhaConta = lazy(() => import("@/pages/admin/MinhaConta"));

const AlterarSenha = lazy(() => import("@/pages/shared/AlterarSenha"));

const queryClient = new QueryClient({
  // Consultas ficam no padrão ("online"): sem rede pausam e retomam ao reconectar. Gravações NÃO podem pausar em silêncio
  // (o botão ficaria em "Salvando…" para sempre): com "always" elas falham na hora e caem no aviso de erro da tela.
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 }, mutations: { networkMode: "always" } },
});

function PostLoginRedirect() {
  const { profile, loading, loadError } = useAuth();
  // Espera a sessão: sem isso, abrir o app já logado mandava para /login (o formulário piscava) antes da home.
  if (loading) return <TelaDeAbertura />;
  if (!profile && loadError) return <TelaSessaoNaoCarregou />;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === "admin" ? "/admin/dashboard" : "/app/home"} replace />;
}

function AppRoutes() {
  return (
    // Fallback externo: só para o que fica FORA dos layouts (login, cadastro, 404) e para os próprios layouts. Dentro deles cada tela tem o seu.
    <Suspense fallback={<TelaDeAbertura />}>
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
          <Route path="/admin/alunos/:studentId/recorrencia" element={<AdminAlunoRecorrencia />} />
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
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FaixaSemInternet />
        <FaixaConexaoLenta />
        <BrowserRouter>
          <AnunciadorDeRota />
          <TransicaoDeTela />
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          position="bottom-center"
          offset={84}
          toastOptions={{
            classNames: {
              toast: "!bg-overlay !border !border-border !text-foreground !rounded-2xl",
              actionButton: "!bg-secondary !text-accent",
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
