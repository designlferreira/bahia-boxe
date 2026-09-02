import { useState } from "react";
import { addDays } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ErrorState } from "@/components/ErrorState";
import { RejectBookingModal } from "@/components/RejectBookingModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDayNumber, formatWeekdayLong, formatWeekdayShort } from "@/lib/dateUtils";
import { getStatusConfig, isAwaitingConfirmation } from "@/lib/bookingStatus";
import { useLessonActions } from "@/hooks/useLessonActions";
import { approveBooking, getAdminAgendaForDay, rejectBooking, type TimelineEntry } from "@/integrations/backend/api";

const DAY_COUNT = 7;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function dotClassFor(entry: TimelineEntry) {
  const status = entry.booking!.status;
  if (status === "scheduled" && isAwaitingConfirmation(status, entry.booking!.endTime)) return "bg-amber";
  switch (status) {
    case "scheduled":
      return "bg-primary";
    case "completed":
      return "bg-accent";
    case "pending_confirmation":
    case "rejected_with_suggestion":
      return "bg-amber";
    case "no_show":
    case "rejected":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
  }
}

export default function AdminAgenda() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dayOffset, setDayOffset] = useState(0);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; student: string; time: string } | null>(null);

  const days = Array.from({ length: DAY_COUNT }, (_, i) => addDays(new Date(), i));
  const selectedDate = days[dayOffset];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-agenda", profile?.id, selectedDate.toDateString()],
    queryFn: () => getAdminAgendaForDay(profile!.id, selectedDate),
    enabled: !!profile,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }

  const actions = useLessonActions(invalidate);

  const approve = useMutation({
    mutationFn: (entry: TimelineEntry) => approveBooking(entry.booking!.id),
    onSuccess: (_r, entry) => {
      invalidate();
      toast.success(`Aula de ${entry.studentName?.split(" ")[0]} aprovada`);
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível aprovar o agendamento.")),
  });

  const reject = useMutation({
    mutationFn: ({ id, note, start, end }: { id: string; note: string; start: Date | null; end: Date | null }) =>
      rejectBooking(id, note, start?.toISOString() ?? null, end?.toISOString() ?? null),
    onSuccess: (_r, vars) => {
      invalidate();
      setRejectTarget(null);
      toast.warning(vars.start ? "Recusado com sugestão de horário" : "Agendamento recusado");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível recusar o agendamento.")),
  });

  if (!profile) return null;

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">AGENDA DO DIA</h1>
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="flex-1 text-[12.5px] text-muted-foreground">
          {formatDate(selectedDate)} · {data?.filter((t) => !t.free).length ?? 0} aulas
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate("/admin/disponibilidade")}>
          Disponibilidade
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-4 pb-1 scroll-fade-x">
        {days.map((d, i) => {
          const on = dayOffset === i;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setDayOffset(i)}
              aria-label={`${formatWeekdayLong(d)}, dia ${formatDayNumber(d)}`}
              aria-pressed={on}
              className={cn(
                "shrink-0 w-14 py-2 rounded-2xl border transition-all active:scale-95",
                on ? "bg-primary border-primary" : "bg-secondary border-border",
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "text-[10.5px] uppercase tracking-wide whitespace-nowrap",
                  on ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {formatWeekdayShort(d)}
              </div>
              <div
                aria-hidden
                className={cn("font-display text-[23px] leading-tight", on ? "text-primary-foreground" : "text-foreground")}
              >
                {formatDayNumber(d)}
              </div>
            </button>
          );
        })}
      </div>

      {isError && <ErrorState title="Não foi possível carregar a agenda" onRetry={() => refetch()} />}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="flex flex-col">
          {data.map((entry) => {
            const booking = entry.booking;
            const awaiting = !entry.free && booking!.status === "scheduled" && isAwaitingConfirmation(booking!.status, booking!.endTime);
            const cfg = booking ? getStatusConfig(booking.status) : null;

            return (
              <div key={entry.hour} className="flex gap-3 min-h-[74px]">
                <div className="w-11 shrink-0 text-right pt-0.5">
                  <div className="text-xs text-muted-foreground tabular-nums">{entry.hour}</div>
                </div>
                <div className="w-0.5 bg-[#262626] shrink-0 relative">
                  <span
                    className={cn(
                      "absolute -left-[3px] top-1.5 h-2 w-2 rounded-full transition-colors",
                      entry.free ? "bg-[#2E2E2E]" : dotClassFor(entry),
                    )}
                  />
                </div>
                <div className="flex-1 pb-3">
                  {entry.free ? (
                    <div className="border border-dashed border-[#2E2E2E] rounded-2xl p-3.5 text-[12.5px] text-muted-foreground">
                      Horário livre
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/aula/${booking!.id}`)}
                      className={cn(
                        "w-full text-left bg-card border rounded-2xl p-3.5 transition-colors active:scale-[0.99]",
                        booking?.status === "pending_confirmation" || awaiting ? "border-amber/35" : "border-border",
                      )}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <div className="text-[14.5px] font-semibold text-foreground flex items-center gap-1.5">
                            {entry.studentName}
                            {booking?.isReplacement && (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                Reposição
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {entry.hour} – {String((parseInt(entry.hour, 10) + 1) % 24).padStart(2, "0")}:00
                          </div>
                        </div>
                        <Badge className={cn(awaiting ? "bg-amber/20 text-amber" : cfg!.badgeClass, "whitespace-nowrap")}>
                          {awaiting ? "Aguardando confirmação" : cfg!.label}
                        </Badge>
                      </div>

                      {booking?.status === "pending_confirmation" && (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="flex-1 h-10" onClick={() => approve.mutate(entry)} disabled={approve.isPending}>
                            Aprovar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1 h-10"
                            onClick={() =>
                              setRejectTarget({
                                id: booking.id,
                                student: entry.studentName!,
                                time: `${entry.hour} – ${String((parseInt(entry.hour, 10) + 1) % 24).padStart(2, "0")}:00`,
                              })
                            }
                          >
                            Recusar
                          </Button>
                        </div>
                      )}

                      {booking?.status === "scheduled" && (
                        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                          {awaiting && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-10 !bg-accent/10 !text-accent !border !border-accent/40 !shadow-none"
                                disabled={actions.isBusy(booking.id)}
                                onClick={() => actions.openComplete(booking, entry.studentName ?? "Aluno")}
                              >
                                Concluir
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1 h-10"
                                disabled={actions.isBusy(booking.id)}
                                onClick={() => actions.openNoShow(booking, entry.studentName ?? "Aluno")}
                              >
                                Falta
                              </Button>
                            </div>
                          )}
                          {!booking.isReplacement && (
                            <button
                              type="button"
                              onClick={() => actions.openReplacement(booking, entry.studentName ?? "Aluno")}
                              className="self-start text-[12px] text-muted-foreground underline underline-offset-2 min-h-11 flex items-center"
                            >
                              Marcar como reposição
                            </button>
                          )}
                        </div>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

      {actions.dialogs}
    </div>
  );
}
