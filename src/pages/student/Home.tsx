import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, ChevronRight, Clock3 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStudentHome } from "@/integrations/backend/api";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDayNumber, formatMonthShort, formatDateTime } from "@/lib/dateUtils";
import { packageProgressPct } from "@/lib/packageUtils";

export default function StudentHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-home", profile?.id],
    queryFn: () => getStudentHome(profile!.id),
    enabled: !!profile,
  });

  if (!profile) return null;

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
          <div className="relative rounded-[22px] p-[22px] mb-3.5 bg-[linear-gradient(150deg,#1F1B0C_0%,#171717_58%)] border border-[#35301A] overflow-hidden animate-bb-up">
            <div className="absolute -right-8 -top-8 w-[150px] h-[150px] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.18),transparent_70%)]" />
            <div className="text-xs tracking-[0.16em] uppercase text-accent/70 font-semibold">Créditos disponíveis</div>
            <div className="flex items-end gap-2.5 my-0.5 mb-3.5">
              <span className="font-display text-[92px] leading-[0.82] text-accent">{data.credits}</span>
              <span className="text-sm text-muted-foreground pb-3">aula(s) para agendar</span>
            </div>
            {data.package && (
              <>
                <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
                    style={{ width: `${packageProgressPct(data.package.totalClasses, data.package.usedClasses)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[12.5px] text-muted-foreground">
                  <span>
                    {data.package.usedClasses} de {data.package.totalClasses} usadas · {data.credits} disponíveis
                  </span>
                  <span>{data.package.templateName}</span>
                </div>
              </>
            )}
            {data.credits <= 2 && (
              <div className="mt-3.5 flex gap-2 items-center px-3 py-2.5 rounded-xl bg-amber/10 border border-amber/30">
                <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
                <span className="text-[12.5px] text-amber">Restam poucas aulas — peça a renovação do pacote.</span>
              </div>
            )}
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
            onClick={() => navigate(data.credits === 0 ? "/app/pacotes" : "/app/agendar")}
          >
            <Calendar className="h-[19px] w-[19px]" />
            {data.credits === 0 ? "Solicitar pacote" : "Agendar aula"}
          </Button>
          <div className="text-center text-xs text-muted-foreground mt-2.5">
            {data.credits === 0 ? "Seu pacote acabou — peça a renovação" : "Escolha dia e horário em 2 toques"}
          </div>
        </>
      )}
    </div>
  );
}
