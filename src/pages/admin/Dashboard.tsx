import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { RejectBookingModal } from "@/components/RejectBookingModal";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatTime } from "@/lib/dateUtils";
import { approveBooking, getAdminDashboard, rejectBooking } from "@/integrations/backend/api";
import { getStatusConfig } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Clock3 } from "lucide-react";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<{ id: string; student: string; time: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-dashboard", profile?.id],
    queryFn: () => getAdminDashboard(profile!.id),
    enabled: !!profile,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success("Aula aprovada");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível aprovar o agendamento.")),
  });

  const reject = useMutation({
    mutationFn: ({ id, note, start, end }: { id: string; note: string; start: Date | null; end: Date | null }) =>
      rejectBooking(id, note, start?.toISOString() ?? null, end?.toISOString() ?? null),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setRejectTarget(null);
      toast.warning(vars.start ? "Recusado com sugestão de horário" : "Agendamento recusado");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível recusar o agendamento.")),
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
              onClick={() => navigate("/admin/agenda")}
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
                        <div className="text-[12.5px] text-muted-foreground mt-0.5">
                          {formatDateTime(b.startTime)} – {formatTime(b.endTime)}
                        </div>
                      </div>
                      <Badge className="bg-amber/20 text-amber">Pendente</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => approve.mutate(b.id)}>
                        Aprovar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          setRejectTarget({ id: b.id, student: b.studentName, time: `${formatTime(b.startTime)} – ${formatTime(b.endTime)}` })
                        }
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
            <div className="font-display text-[19px] tracking-wide text-foreground">PRÓXIMAS AULAS</div>
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
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </div>
                  </div>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </button>
              );
            })}
          </div>

          <div className="font-display text-[19px] tracking-wide text-foreground mb-2.5">ALUNOS EM RISCO</div>
          <div className="flex flex-col gap-2.5">
            {data.atRisk.length === 0 && (
              <div className="text-[13px] text-muted-foreground">Nenhum aluno em risco no momento.</div>
            )}
            {data.atRisk.map(({ student, credits }) => (
              <button
                key={student.id}
                type="button"
                onClick={() => navigate(`/admin/alunos/${student.id}`)}
                className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform"
              >
                <div className="h-[38px] w-[38px] rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold text-foreground/80">
                  {student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold text-foreground">{student.name}</div>
                  <div className={`text-xs ${credits === 0 ? "text-destructive" : "text-amber"}`}>
                    {credits === 0 ? "Sem créditos" : "Resta 1 crédito"}
                  </div>
                </div>
                <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
              </button>
            ))}
          </div>
        </>
      )}

      {rejectTarget && (
        <RejectBookingModal
          open={!!rejectTarget}
          onOpenChange={(o) => !o && setRejectTarget(null)}
          adminId={profile.id}
          studentName={rejectTarget.student}
          timeLabel={rejectTarget.time}
          onConfirm={(note, start, end) => reject.mutate({ id: rejectTarget.id, note, start, end })}
        />
      )}
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
