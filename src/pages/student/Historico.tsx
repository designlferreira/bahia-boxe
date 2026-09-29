import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BookingCard } from "@/components/BookingCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatQuando } from "@/lib/dateUtils";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { PageHeader } from "@/components/PageHeader";
import {
  getModoAgendamentoEfetivo,
  getStudentAdminId,
  getStudentBookingHistory,
  getWhatsappDoProfessor,
} from "@/integrations/backend/api";

type Tab = "proximas" | "anteriores";

export default function StudentHistorico() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("proximas");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-history", profile?.id, tab],
    queryFn: () => getStudentBookingHistory(profile!.id, tab),
    enabled: !!profile,
  });

  // O vazio depende de quem marca as aulas: no autosserviço o aluno agenda; na Recorrência quem marca é o professor
  // (a rota de agendar redireciona), então o botão certo ali é falar com ele — mesmas consultas da Home/Minha conta.
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
  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-professor", adminId],
    queryFn: () => getWhatsappDoProfessor(adminId!),
    enabled: !!adminId,
    staleTime: 60 * 60 * 1000,
  });

  const n = data?.length ?? 0;
  // "Histórico completo do seu pacote" era falso (a lista traz aulas de todos os pacotes) e nem fazia sentido em Próximas.
  const subtitle =
    !data || isError
      ? undefined
      : tab === "proximas"
        ? n === 0
          ? undefined
          : `${n} ${n === 1 ? "aula marcada" : "aulas marcadas"}`
        : n === 0
          ? undefined
          : "As mais recentes primeiro";

  return (
    <div className="page-container">
      <PageHeader title="MINHAS AULAS" subtitle={subtitle} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="proximas">Próximas</TabsTrigger>
          <TabsTrigger value="anteriores">Anteriores</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={4} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map((b) => (
            <BookingCard
              key={b.id}
              // "Amanhã, 19:00" / "Quarta-feira, 30 set · 19:00": responde "quando é?" sem o aluno calcular o dia da semana
              // (antes: "30" + "set" com o mês em 10,5px e só "19:00 – 20:00"). A hora final fica no detalhe.
              title={formatQuando(b.startTime)}
              status={b.status}
              semRegistro={isAwaitingConfirmation(b.status, b.endTime)}
              agora={b.status === "scheduled" && new Date(b.startTime).getTime() <= Date.now() && new Date(b.endTime).getTime() > Date.now()}
              onClick={() => navigate(`/app/aula/${b.id}`)}
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        tab === "anteriores" ? (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma aula anterior ainda"
            description="Depois da sua primeira aula, ela aparece aqui."
          />
        ) : modo === "recorrencia" ? (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma aula marcada"
            description="Seu professor marca as suas aulas. Quando ele marcar, elas aparecem aqui."
            ctaLabel={whatsapp ? "Falar com o professor" : undefined}
            ctaVariant="secondary"
            onCta={
              whatsapp
                ? () => window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Aqui é ${profile?.name.split(" ")[0] ?? ""}.`)}`, "_blank", "noopener")
                : undefined
            }
          />
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma aula marcada"
            description="Escolha um dia e um horário para a sua próxima aula."
            ctaLabel={modo === "autosservico" ? "Agendar aula" : undefined}
            onCta={modo === "autosservico" ? () => navigate("/app/agendar") : undefined}
          />
        )
      )}
    </div>
  );
}
