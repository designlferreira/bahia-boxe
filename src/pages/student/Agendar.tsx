import { useState } from "react";
import { addDays } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDayNumber, formatWeekdayLong, formatWeekdayShort } from "@/lib/dateUtils";
import { getAvailableSlotsForDay, getStudentAdminId, getStudentHome, scheduleBooking } from "@/integrations/backend/api";
import { CalendarSearch } from "lucide-react";

const DAY_COUNT = 7;

export default function StudentAgendar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dayOffset, setDayOffset] = useState(1);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const days = Array.from({ length: DAY_COUNT }, (_, i) => addDays(new Date(), i + 1));
  const selectedDate = days[dayOffset] ?? days[0];

  const { data: home } = useQuery({
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

  const { data: slots, isLoading } = useQuery({
    queryKey: ["available-slots", adminId, selectedDate.toDateString()],
    queryFn: () => getAvailableSlotsForDay(adminId!, selectedDate),
    enabled: !!adminId,
  });

  const schedule = useMutation({
    mutationFn: () => {
      const [h] = selectedTime!.split(":").map(Number);
      const start = new Date(selectedDate);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start);
      end.setHours(h + 1);
      return scheduleBooking(profile!.id, adminId!, start.toISOString(), end.toISOString());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      toast.success("Enviado! Aguarde a aprovação do professor");
    },
  });

  return (
    <div className="page-container pb-40">
      <PageHeader
        title="AGENDAR AULA"
        back
        subtitle={home ? `${home.credits} crédito(s) disponível(is)` : undefined}
      />

      <div className="flex gap-2.5 overflow-x-auto -mx-5 px-5 pb-3.5 scroll-fade-x">
        {days.map((d, i) => {
          const on = dayOffset === i;
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => {
                setDayOffset(i);
                setSelectedTime(null);
              }}
              aria-label={`${formatWeekdayLong(d)}, dia ${formatDayNumber(d)}`}
              aria-pressed={on}
              className={cn(
                "shrink-0 w-[62px] py-2.5 rounded-2xl border transition-all active:scale-95",
                on ? "bg-primary border-primary" : "bg-secondary border-border",
              )}
            >
              <div
                aria-hidden
                className={cn(
                  "text-[11px] uppercase tracking-wide whitespace-nowrap",
                  on ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {formatWeekdayShort(d)}
              </div>
              <div
                aria-hidden
                className={cn("font-display text-2xl leading-tight", on ? "text-primary-foreground" : "text-foreground")}
              >
                {formatDayNumber(d)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="font-display text-lg tracking-wide text-foreground my-2 mb-2.5">HORÁRIOS LIVRES</div>

      {(isLoading || !adminId) && (
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[66px] rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && slots && slots.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {slots.map((s) => {
            const full = s.status === "booked";
            const on = selectedTime === s.time;
            return (
              <button
                key={s.time}
                type="button"
                disabled={full}
                onClick={() => setSelectedTime(on ? null : s.time)}
                className={cn(
                  "h-[66px] rounded-2xl border text-left px-3.5 transition-all active:scale-95",
                  full && "bg-[#141414] border-[#222] cursor-not-allowed",
                  !full && on && "bg-primary/15 border-primary",
                  !full && !on && "bg-secondary border-border",
                )}
              >
                <div className={cn("text-base font-semibold", full ? "text-muted-foreground/40" : "text-foreground")}>
                  {s.time}
                </div>
                <div className={cn("text-[11.5px]", full ? "text-muted-foreground/30" : on ? "text-primary" : "text-muted-foreground")}>
                  {full ? "Sem vaga" : on ? "Selecionado" : "Disponível"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && slots && slots.length === 0 && (
        <EmptyState
          icon={CalendarSearch}
          title="Sem horários nesse dia"
          description="O professor não abriu disponibilidade."
          ctaLabel="Ver próximo dia"
          onCta={() => {
            setDayOffset((d) => (d + 1) % DAY_COUNT);
            setSelectedTime(null);
          }}
        />
      )}

      {selectedTime && (
        <div className="fixed inset-x-0 bottom-[84px] px-5 pb-3 pt-6 bg-[linear-gradient(180deg,transparent,hsl(var(--background))_34%)] z-20 animate-bb-toast">
          <Button size="lg" className="w-full h-14" onClick={() => schedule.mutate()} disabled={schedule.isPending}>
            {schedule.isPending ? "Confirmando…" : `Confirmar ${selectedTime}`}
          </Button>
        </div>
      )}
    </div>
  );
}
