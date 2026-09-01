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
import { formatDate, formatDayNumber, formatWeekdayShort } from "@/lib/dateUtils";
import { getStatusConfig } from "@/lib/bookingStatus";
import {
  approveBooking,
  completeBooking,
  getAdminAgendaForDay,
  markNoShow,
  rejectBooking,
  type TimelineEntry,
} from "@/integrations/backend/api";

const DAY_COUNT = 7;

function dotClassFor(status: string) {
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

  const approve = useMutation({
    mutationFn: (entry: TimelineEntry) => approveBooking(entry.booking!.id),
    onSuccess: (_r, entry) => {
      invalidate();
      toast.success(`Aula de ${entry.studentName?.split(" ")[0]} aprovada`);
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, note, start, end }: { id: string; note: string; start: Date | null; end: Date | null }) =>
      rejectBooking(id, note, start?.toISOString() ?? null, end?.toISOString() ?? null),
    onSuccess: (_r, vars) => {
      invalidate();
      setRejectTarget(null);
      toast.warning(vars.start ? "Recusado com sugestão de horário" : "Agendamento recusado");
    },
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeBooking(id),
    onSuccess: () => {
      invalidate();
      toast.success("Aula concluída");
    },
  });

  const noShow = useMutation({
    mutationFn: (id: string) => markNoShow(id),
    onSuccess: () => {
      invalidate();
      toast.warning("Falta registrada");
    },
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
              className={cn(
                "shrink-0 w-14 py-2 rounded-2xl border transition-all active:scale-95",
                on ? "bg-primary border-primary" : "bg-secondary border-border",
              )}
            >
              <div className={cn("text-[10.5px] uppercase tracking-wide", on ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {formatWeekdayShort(d)}
              </div>
              <div className={cn("font-display text-[23px] leading-tight", on ? "text-primary-foreground" : "text-foreground")}>
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
          {data.map((entry) => (
            <div key={entry.hour} className="flex gap-3 min-h-[74px]">
              <div className="w-11 shrink-0 text-right pt-0.5">
                <div className="text-xs text-muted-foreground tabular-nums">{entry.hour}</div>
              </div>
              <div className="w-0.5 bg-[#262626] shrink-0 relative">
                <span
                  className={cn(
                    "absolute -left-[3px] top-1.5 h-2 w-2 rounded-full",
                    entry.free ? "bg-[#2E2E2E]" : dotClassFor(entry.booking!.status),
                  )}
                />
              </div>
              <div className="flex-1 pb-3">
                {entry.free ? (
                  <div className="border border-dashed border-[#2E2E2E] rounded-2xl p-3.5 text-[12.5px] text-muted-foreground">
                    Horário livre
                  </div>
                ) : (
                  <div
                    className={cn(
                      "bg-card border rounded-2xl p-3.5",
                      entry.booking?.status === "pending_confirmation" ? "border-amber/35" : "border-border",
                    )}
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <div className="text-[14.5px] font-semibold text-foreground">{entry.studentName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {entry.hour} – {String((parseInt(entry.hour, 10) + 1) % 24).padStart(2, "0")}:00
                        </div>
                      </div>
                      <Badge className={cn(getStatusConfig(entry.booking!.status).badgeClass, "whitespace-nowrap")}>
                        {getStatusConfig(entry.booking!.status).label}
                      </Badge>
                    </div>
                    {entry.booking?.status === "pending_confirmation" && (
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 h-10" onClick={() => approve.mutate(entry)}>
                          Aprovar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 h-10"
                          onClick={() =>
                            setRejectTarget({
                              id: entry.booking!.id,
                              student: entry.studentName!,
                              time: `${entry.hour} – ${String((parseInt(entry.hour, 10) + 1) % 24).padStart(2, "0")}:00`,
                            })
                          }
                        >
                          Recusar
                        </Button>
                      </div>
                    )}
                    {entry.booking?.status === "scheduled" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-10 !bg-accent/10 !text-accent !border !border-accent/40 !shadow-none"
                          onClick={() => complete.mutate(entry.booking!.id)}
                        >
                          Concluir
                        </Button>
                        <Button variant="secondary" size="sm" className="flex-1 h-10" onClick={() => noShow.mutate(entry.booking!.id)}>
                          Falta
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
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
    </div>
  );
}
