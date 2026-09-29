import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, MessageCircle, Package, Ruler, Trophy, UserRound } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AccountRow } from "@/components/AccountRow";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { TIMEZONE } from "@/lib/dateUtils";
import { getModoAgendamentoEfetivo, getStudentAdminId, getWhatsappDoProfessor } from "@/integrations/backend/api";

export default function StudentMinhaConta() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Em Recorrência o aluno não pede pacote (a tela de pacotes redireciona): a linha "Meu pacote" não aparece.
  const { data: adminId } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });
  const { data: modo } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });
  const mostraPacote = modo !== "recorrencia";

  // Canal do aluno com o professor (mesmo da Home): sem número cadastrado, a linha não aparece.
  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-professor", adminId],
    queryFn: () => getWhatsappDoProfessor(adminId!),
    enabled: !!adminId,
    staleTime: 60 * 60 * 1000,
  });

  // Antes `return null` deixava a tela em branco, sem título, enquanto o perfil não chegava.
  if (!profile) {
    return (
      <div className="page-container">
        <PageHeader title="MINHA CONTA" />
        <SkeletonCard height={90} className="mb-4" />
        <SkeletonCard height={200} />
      </div>
    );
  }
  // `filter(Boolean)`: nome com espaço duplo ou no fim não pula uma inicial.
  const initials = profile.name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="page-container">
      <PageHeader title="MINHA CONTA" />

      <div className="card-dark p-4 flex items-center gap-3.5 mb-4">
        <Avatar initials={initials} size="md" />
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground break-words">{profile.name}</div>
          {/* O e-mail da conta: "com qual conta eu entrei?" (só leitura). */}
          <div className="text-[12.5px] text-muted-foreground break-all">{profile.email}</div>
          {/* Sem gênero ("Aluna" era fixo para todos) e com o ano. */}
          <div className="text-[12.5px] text-muted-foreground">
            Na academia desde {formatInTimeZone(profile.createdAt, TIMEZONE, "MMM/yyyy", { locale: ptBR })}
          </div>
        </div>
      </div>

      <ul aria-label="Minha conta" className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden mb-3.5">
        {/* Nomes que dizem o que abre (antes: "Editar perfil" só editava o nome e "Perfil físico e de boxe"
            parecia o "Perfil de Boxe" da Home, que é o resultado do estilo de luta). */}
        {whatsapp && (
          <AccountRow
            label="Falar com o professor"
            hint="Abre uma conversa no WhatsApp"
            icon={MessageCircle}
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Aqui é ${profile.name.split(" ")[0]}.`)}`}
          />
        )}
        <AccountRow label="Meu nome" icon={UserRound} onClick={() => setEditOpen(true)} />
        <AccountRow label="Meu Perfil de Boxe" icon={Trophy} onClick={() => navigate("/app/perfil-lutador")} />
        <AccountRow label="Meus dados físicos" icon={Ruler} onClick={() => navigate("/app/minha-conta/perfil")} />
        {mostraPacote && <AccountRow label="Meu pacote" icon={Package} onClick={() => navigate("/app/pacotes")} />}
        <AccountRow
          label="Alterar senha"
          icon={KeyRound}
          onClick={() => navigate("/app/minha-conta/alterar-senha")}
          last
        />
      </ul>

      <PWAInstallBanner placement="settings" />

      {/* Sair é uma ação rara: discreta (sem preenchimento), no fim da tela. Antes era o botão vermelho de
          largura total, o elemento mais forte da tela — o vermelho fica para a ação principal de cada tela. */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-[hsl(var(--red-text))] hover:text-[hsl(var(--red-text))]"
        onClick={() => setConfirmLogout(true)}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Sair da conta
      </Button>

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="SAIR DA CONTA"
        description="Você precisará entrar novamente com e-mail e senha."
        confirmLabel="Sair"
        onConfirm={() => signOut()}
      />
    </div>
  );
}
