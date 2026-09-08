import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ChevronRight, Clock3 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ActivePackageCard } from "@/components/ActivePackageCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getModoAgendamentoEfetivo, getStudentAdminId, getStudentHome } from "@/integrations/backend/api";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDayNumber, formatMonthShort, formatDateTime } from "@/lib/dateUtils";

export default function StudentHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-home", profile?.id],
    queryFn: () => getStudentHome(profile!.id),
    enabled: !!profile,
  });

  const { data: adminId } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  // CLAUDE.md, Etapa 7 — CORRIGIDO 2026-09-08: o botão principal decide QUAL AÇÃO oferecer
  // (agendar sozinho x ver a agenda que o professor já montou), e isso é navegação — ramifica na
  // FLAG (modo_agendamento), não no dado de um pacote específico. Antes ramificava em
  // `recorrenciaSaldo` (existe saldo de recorrência NESTE pacote): um professor que ativa
  // RECORRENCIA mas cujo aluno ainda segura um pacote `purchase` antigo veria "Agendar aula" —
  // errado, porque `Agendar.tsx` já redireciona esse aluno pra fora mesmo assim.
  const { data: modoEfetivo } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });
  const isRecorrencia = modoEfetivo === "recorrencia";

  if (!profile) return null;

  // ActivePackageCard já resolve sozinho "crédito disponível" não fazer sentido em recorrência
  // (mostra saldo.restantes em vez de credits quando `saldo` existe) — isso aqui é só o dado que o
  // card precisa, não decide mais navegação.
  const saldo = data?.recorrenciaSaldo ?? null;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[13px] text-muted-foreground">Bom treino,</div>
          <h1 className="font-display text-[28px] leading-tight tracking-wide text-foreground uppercase">
            {profile.name}
          </h1>
        </div>
        <NotificationBell userId={profile.id} />
      </div>

      <PWAInstallBanner />

      {isLoading && <SkeletonCard height={168} className="mb-3.5" />}
      {isError && <ErrorState title="Não foi possível carregar seu painel" onRetry={() => refetch()} />}

      {data && (
        <>
          <div className="mb-3.5 animate-bb-up">
            <ActivePackageCard pkg={data.package} credits={data.credits} saldo={saldo} />
          </div>

          {data.suggestion && (
            <button
              type="button"
              onClick={() => navigate(`/app/aula/${data.suggestion!.id}`)}
              className="w-full text-left flex gap-3 items-center p-3.5 rounded-2xl bg-amber/10 border border-amber/30 mb-3.5 active:scale-[0.98] transition-transform animate-bb-up"
            >
              <div className="h-[38px] w-[38px] rounded-xl bg-amber/15 flex items-center justify-center shrink-0">
                <Clock3 className="h-[18px] w-[18px] text-amber" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber">Novo horário sugerido</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {formatDateTime(data.suggestion.suggestedStartTime ?? data.suggestion.startTime)}
                </div>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          )}

          <div className="font-display text-[19px] tracking-wide text-foreground my-1 mb-2.5">PRÓXIMA AULA</div>
          {data.nextBooking ? (
            <button
              type="button"
              onClick={() => navigate(`/app/aula/${data.nextBooking!.id}`)}
              className="w-full text-left card-dark p-4 flex gap-3.5 items-center mb-5 active:scale-[0.98] transition-transform animate-bb-up"
            >
              <div className="w-[54px] text-center border-r border-border pr-3">
                <div className="font-display text-3xl leading-none text-foreground">
                  {formatDayNumber(data.nextBooking.startTime)}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground tracking-wide">
                  {formatMonthShort(data.nextBooking.startTime)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-foreground mb-1">
                  {formatDateTime(data.nextBooking.startTime)}
                </div>
                <Badge className={getStatusConfig(data.nextBooking.status).badgeClass}>
                  {getStatusConfig(data.nextBooking.status).label}
                </Badge>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center mb-5">
              <div className="text-sm text-foreground/80 mb-1">Nenhuma aula agendada</div>
              <div className="text-[12.5px] text-muted-foreground">Escolha um horário livre do professor.</div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full h-[58px] animate-bb-pulse"
            onClick={() => navigate(isRecorrencia ? "/app/historico" : data.credits === 0 ? "/app/pacotes" : "/app/agendar")}
          >
            <Calendar className="h-[19px] w-[19px]" />
            {isRecorrencia ? "Ver minhas aulas" : data.credits === 0 ? "Solicitar pacote" : "Agendar aula"}
          </Button>
          <div className="text-center text-xs text-muted-foreground mt-2.5">
            {isRecorrencia
              ? "Suas aulas já estão marcadas pelo professor"
              : data.credits === 0
                ? "Seu pacote acabou — peça a renovação"
                : "Escolha dia e horário em 2 toques"}
          </div>
        </>
      )}
    </div>
  );
}
