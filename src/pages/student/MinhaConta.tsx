import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, KeyRound, Package, Ruler, Trophy, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { formatDateShort } from "@/lib/dateUtils";
import { getModoAgendamentoEfetivo, getStudentAdminId } from "@/integrations/backend/api";

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

  if (!profile) return null;
  const initials = profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground mb-4">MINHA CONTA</h1>

      <div className="card-dark p-4 flex items-center gap-3.5 mb-4">
        <Avatar initials={initials} size="md" />
        <div>
          <div className="text-base font-semibold text-foreground">{profile.name}</div>
          <div className="text-[12.5px] text-muted-foreground">Aluna · desde {formatDateShort(profile.createdAt)}</div>
        </div>
      </div>

      <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden mb-3.5">
        {/* Nomes que dizem o que abre (antes: "Editar perfil" só editava o nome e "Perfil físico e de boxe"
            parecia o "Perfil de Boxe" da Home, que é o resultado do estilo de luta). */}
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
      </div>

      <PWAInstallBanner placement="settings" />

      <Button variant="destructive" size="lg" className="w-full" onClick={() => setConfirmLogout(true)}>
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

function AccountRow({
  label,
  icon: Icon,
  onClick,
  last,
}: {
  label: string;
  icon: typeof KeyRound;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[52px] px-4 flex items-center gap-2.5 text-left text-[14.5px] text-foreground hover:bg-secondary transition-colors ${
        last ? "" : "border-b border-[#232323]"
      }`}
    >
      <Icon className="h-[17px] w-[17px] text-muted-foreground" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </button>
  );
}
