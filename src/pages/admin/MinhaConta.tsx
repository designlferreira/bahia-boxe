import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Package, Settings, CalendarClock, UserRound, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AccountRow } from "@/components/AccountRow";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { EditProfileDialog } from "@/components/EditProfileDialog";

export default function AdminMinhaConta() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Antes `return null` deixava a tela em branco, sem título, enquanto o perfil não chegava (o aluno já tinha o esqueleto).
  if (!profile) {
    return (
      <div className="page-container">
        <PageHeader title="MINHA CONTA" />
        <SkeletonCard height={90} className="mb-4" />
        <SkeletonCard height={330} />
      </div>
    );
  }
  // `filter(Boolean)`: nome com espaço duplo ou no fim não pula uma inicial; maiúsculas mesmo se o nome foi digitado em minúsculas.
  const initials = profile.name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="page-container">
      <PageHeader title="MINHA CONTA" />

      <div className="card-dark p-4 flex items-center gap-3.5 mb-4">
        <Avatar initials={initials} size="md" />
        {/* `min-w-0` + quebra: um nome ou e-mail longo passava de 700px e estourava a tela. O e-mail da conta responde "com qual conta eu
            entrei?" (o aluno já tinha); "Professor · desde 13 mar" saiu: sem ano, e era a data de criação da conta, não de quando
            começou a dar aula. */}
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground break-words">{profile.name}</div>
          <div className="text-[12.5px] text-muted-foreground break-all">{profile.email}</div>
        </div>
      </div>

      {/* Dois blocos: o que o professor OFERECE (ferramentas do negócio) e a CONTA dele. Antes eram 6 linhas numa lista só e "onde mudo
          meus horários?" dependia de adivinhar que era em "Conta" (a barra de baixo não tem Horários nem Pacotes). A barra não mudou. */}
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">O que você oferece</h2>
      <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden mb-5">
        <AccountRow label="Minha disponibilidade" icon={CalendarClock} onClick={() => navigate("/admin/disponibilidade")} />
        <AccountRow label="Modelos de pacote" icon={Package} onClick={() => navigate("/admin/pacotes")} />
        <AccountRow
          label="Perfil dos alunos"
          hint="Médias de altura, peso e guarda dos alunos"
          icon={Users}
          onClick={() => navigate("/admin/perfil-alunos")}
          last
        />
      </div>

      <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Minha conta</h2>
      <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden mb-3.5">
        <AccountRow
          label="Configurações"
          hint="Modo de agendamento, WhatsApp e regra de faltas"
          icon={Settings}
          onClick={() => navigate("/admin/configuracoes")}
        />
        <AccountRow label="Meu nome" icon={UserRound} onClick={() => setEditOpen(true)} />
        <AccountRow label="Alterar senha" icon={KeyRound} onClick={() => navigate("/admin/minha-conta/alterar-senha")} last />
      </div>

      <PWAInstallBanner placement="settings" />

      {/* Sair é uma ação rara: discreta (sem preenchimento), no fim da tela. Antes era o botão vermelho de largura total (56px), o
          elemento mais forte de uma tela sem ação principal, colado ao banner de instalar. Igual ao do aluno. */}
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
