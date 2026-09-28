import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatTime } from "@/lib/dateUtils";
import { getAdminDashboard } from "@/integrations/backend/api";
import { getStatusConfig } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Clock3 } from "lucide-react";
import { usePendingActions } from "@/hooks/usePendingActions";

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-dashboard", profile?.id],
    queryFn: () => getAdminDashboard(profile!.id),
    enabled: !!profile,
  });

  // Aprovar/recusar: mesmo hook da Agenda (trava durante o envio, desfazer, remarcação com de -> para).
  const pendentes = usePendingActions(profile?.id ?? "", () => {
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["awaiting-confirmation-bookings"] });
  });

  if (!profile) return null;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-4.5 mb-5">
        <div>
          <div className="text-[13px] text-muted-foreground">{formatDate(new Date())}</div>
          <h1 className="font-display text-[28px] leading-tight tracking-wide text-foreground uppercase">
            Prof. {profile.name.split(" ")[0]}
          </h1>
        </div>
        <NotificationBell userId={profile.id} />
      </div>

      {isError && <ErrorState title="Não foi possível carregar o painel" onRetry={() => refetch()} />}
      {isLoading && <SkeletonList count={3} height={70} />}

      {data && (
        <>
          {data.awaitingConfirmation.length > 0 && (
            <button
              type="button"
              // Leva pra data da pendência mais ANTIGA (data.awaitingConfirmation já vem ordenada
              // por start_time ascendente, getAdminDashboard) — é a que tem mais chance de ser
              // esquecida de vez, e a Agenda lê esse state só na primeira renderização pra pular
              // direto pra semana/dia certos, em vez de sempre abrir em "hoje" (CLAUDE.md, "Agenda
              // com navegação livre").
              onClick={() => navigate("/admin/agenda", { state: { date: data.awaitingConfirmation[0].startTime } })}
              className="w-full text-left rounded-[20px] p-4 mb-4 bg-[linear-gradient(150deg,#1A1F27,#171717_62%)] border border-primary/30 flex items-center gap-3 active:scale-[0.99] transition-transform animate-bb-up"
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
                <Clock3 className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-foreground">
                  {data.awaitingConfirmation.length} aula(s) aguardando confirmação
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  O horário passou — declare se aconteceu ou se o aluno faltou.
                </div>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
            </button>
          )}

          {data.pending.length > 0 && (
            <div className="rounded-[20px] p-4 mb-4 bg-[linear-gradient(150deg,#211A0B,#171717_62%)] border border-amber/30 animate-bb-up">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-amber animate-bb-pulse" />
                <span className="text-[13px] font-semibold text-amber">
                  {data.pending.length} agendamento(s) aguardando aprovação
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {data.pending.map((b) => (
                  <div key={b.id} className="bg-[#141414] border border-border rounded-2xl p-3.5">
                    <div className="flex justify-between items-center mb-2.5">
                      <div>
                        <div className="text-[14.5px] font-semibold text-foreground">{b.studentName}</div>
                        {b.antecessorInicio ? (
                          // Pedido de remarcação: de onde pra onde — sem isso o professor precisava
                          // lembrar qual aula estava sendo movida.
                          <div className="text-sm text-muted-foreground mt-0.5">
                            <span className="line-through">{formatDateTime(b.antecessorInicio)}</span>
                            <span aria-hidden> → </span>
                            <span className="sr-only">para</span>
                            <span className="text-foreground">{formatDateTime(b.startTime)}</span>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {formatDateTime(b.startTime)} – {formatTime(b.endTime)}
                          </div>
                        )}
                      </div>
                      {/* Pendente com antecessor = o aluno pediu pra remarcar uma aula (0033). */}
                      <Badge className="bg-amber/20 text-amber">
                        {b.replacementForBookingId ? "Pedido de remarcação" : "Pendente"}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => pendentes.requestApprove(b)}
                        disabled={pendentes.isBusy(b.id)}
                        aria-label={`Aprovar ${b.studentName}, ${formatDateTime(b.startTime)}`}
                      >
                        Aprovar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => pendentes.requestReject(b)}
                        disabled={pendentes.isBusy(b.id)}
                        aria-label={`Recusar ${b.studentName}, ${formatDateTime(b.startTime)}`}
                      >
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 mb-4">
            <StatCard label="Hoje" value={data.kpiToday} unit="aulas" />
            <StatCard label="Alunos" value={data.activeStudents} unit="ativos" />
          </div>

          <div className="flex justify-between items-baseline mb-2.5">
            <h2 className="section-title">Próximas aulas</h2>
            <button
              type="button"
              onClick={() => navigate("/admin/agenda")}
              className="min-h-11 min-w-11 px-2 -mr-2 flex items-center text-[12.5px] text-muted-foreground"
            >
              Ver agenda
            </button>
          </div>
          <div className="flex flex-col gap-2.5 mb-5">
            {data.upcoming.map((b) => {
              const cfg = getStatusConfig(b.status);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => navigate(`/admin/aula/${b.id}`)}
                  className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
                >
                  <div className="font-display text-xl text-accent w-[52px]">{formatTime(b.startTime)}</div>
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold text-foreground">{b.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(b.startTime)} – {formatTime(b.endTime)}
                    </div>
                  </div>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </button>
              );
            })}
          </div>

          <h2 className="section-title mb-1">Alunos em risco</h2>
          <div className="text-sm text-muted-foreground mb-3">Pacote acabando ou faltas seguidas.</div>
          <div className="flex flex-col gap-2.5">
            {data.atRisk.length === 0 && (
              <div className="text-sm text-muted-foreground">Nenhum aluno em risco no momento.</div>
            )}
            {/* No máximo 3 aqui: com muitos alunos a lista empurrava o resto do painel pra baixo. */}
            {data.atRisk.slice(0, 3).map(({ student, motivo, grave }) => (
              <button
                key={student.id}
                type="button"
                onClick={() => navigate(`/admin/alunos/${student.id}`)}
                className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform"
              >
                <div
                  aria-hidden
                  className="h-[38px] w-[38px] rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold text-foreground/80"
                >
                  {student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-foreground">{student.name}</div>
                  <div className={`text-sm ${grave ? "text-[hsl(var(--red-text))]" : "text-amber"}`}>{motivo}</div>
                </div>
                <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
              </button>
            ))}
            {data.atRisk.length > 3 && (
              <button
                type="button"
                onClick={() => navigate("/admin/alunos")}
                className="min-h-11 text-sm font-semibold text-foreground underline underline-offset-4 self-start"
              >
                Ver todos ({data.atRisk.length})
              </button>
            )}
          </div>
        </>
      )}

      {pendentes.dialogs}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex-1 card-dark p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-[32px] text-foreground leading-tight">{value}</div>
      <div className="text-[11.5px] text-muted-foreground">{unit}</div>
    </div>
  );
}
