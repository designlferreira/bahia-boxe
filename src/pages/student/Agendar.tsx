import { useEffect, useState } from "react";
import { addDays } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateShort, formatDayNumber, formatRelativeDay, formatWeekdayLong, formatWeekdayShort, isoDateOnly } from "@/lib/dateUtils";
import {
  getAvailableSlotsForDays,
  getModoAgendamentoEfetivo,
  getStudentAdminId,
  getStudentHome,
  scheduleBooking,
} from "@/integrations/backend/api";
import type { DaySlot } from "@/integrations/backend/api";
import { CalendarCheck, CalendarSearch } from "lucide-react";

const DAY_COUNT = 7;

/**
 * `schedule_booking` (RPC) levanta códigos em snake_case, não texto — nenhuma tela nunca traduzia
 * isso pro aluno (a mutation não tinha `onError` nenhum, então toda falha era silenciosa). Mapa
 * completo porque adicionar o primeiro tratamento só para o código novo (`slot_already_booked`,
 * agora também coberto pela exclusion constraint) e deixar os outros sete mudos ao lado dele seria
 * inconsistente.
 */
const SCHEDULE_BOOKING_ERRORS: Record<string, string> = {
  slot_not_available: "Esse horário não está mais disponível.",
  slot_not_for_student: "Esse horário não é do seu professor.",
  slot_already_booked: "Esse horário acabou de ser ocupado. Escolha outro.",
  no_active_package_or_no_credits: "Você não tem aulas restantes no momento. Peça um pacote para agendar.",
  no_credits_left_for_future_bookings: "Todas as suas aulas restantes já estão agendadas.",
};

function scheduleBookingErrorMessage(err: unknown) {
  const code = err instanceof Error ? err.message : "";
  return SCHEDULE_BOOKING_ERRORS[code] ?? "Não foi possível agendar essa aula.";
}

export default function StudentAgendar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // null = o aluno ainda não escolheu um dia: a tela abre no primeiro dia com horário livre
  // (decisão do Lucas, 2026-09-28). Antes abria sempre em depois de amanhã (useState(1) com a lista
  // já começando amanhã) — muitas vezes num dia vazio, com horário livre amanhã.
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [selected, setSelected] = useState<DaySlot | null>(null);

  const days = Array.from({ length: DAY_COUNT }, (_, i) => addDays(new Date(), i + 1));

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

  // CLAUDE.md, Etapa 7: quando o professor está em RECORRENCIA, ele controla a agenda do aluno —
  // "Agendar aula" é uma tela do fluxo AUTOSSERVICO e não deve criar reserva nenhuma nesse modo.
  // Redireciona em vez de esconder o link só na Home, porque o link de volta ("Ver minhas aulas")
  // ou um deep link salvo ainda levariam pra cá.
  const { data: modoEfetivo } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (modoEfetivo === "recorrencia") {
      navigate("/app/historico", { replace: true });
      toast("Seu professor gerencia sua agenda por recorrência — fale com ele para marcar aulas.");
    }
  }, [modoEfetivo, navigate]);

  const { data: semana, isLoading } = useQuery({
    queryKey: ["available-slots-semana", adminId, days[0].toDateString()],
    queryFn: () => getAvailableSlotsForDays(adminId!, days),
    enabled: !!adminId && modoEfetivo !== "recorrencia",
  });
  const livresNoDia = (i: number) => (semana?.[isoDateOnly(days[i])] ?? []).filter((s) => s.status === "free").length;
  const primeiroComLivre = semana ? days.findIndex((_, i) => livresNoDia(i) > 0) : -1;
  const dayOffset = escolhido ?? (primeiroComLivre >= 0 ? primeiroComLivre : 0);
  const selectedDate = days[dayOffset];
  const slots = semana?.[isoDateOnly(selectedDate)];
  const setDayOffset = (f: (d: number) => number) => setEscolhido(f(dayOffset));

  const schedule = useMutation({
    // The slot id is what the database books against — no client-side time arithmetic.
    mutationFn: (_quando: string) => scheduleBooking(selected!.slotId),
    // A aula já nasce confirmada (`schedule_booking` grava `scheduled` — conferido no banco em
    // 2026-09-28: nenhum gatilho de INSERT em `bookings`), então o aviso não fala em aprovação.
    // Diz dia e hora: "Aula agendada!" sozinho não deixava o aluno conferir o que marcou.
    onSuccess: (_r, quando) => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      toast.success(`Aula agendada · ${quando}`);
    },
    onError: (err) => {
      toast.error(scheduleBookingErrorMessage(err));
      queryClient.invalidateQueries({ queryKey: ["available-slots-semana"] });
    },
  });

  /** "Amanhã, 19:00" / "Quinta-feira, 01 out · 19:00" — pro aviso depois de confirmar. */
  const quandoEscolhido = () => {
    const dia = formatRelativeDay(selectedDate);
    const hora = selected?.time ?? "";
    return dia === "Hoje" || dia === "Amanhã" ? `${dia}, ${hora}` : `${dia}, ${formatDateShort(selectedDate)} · ${hora}`;
  };

  // Sem aula para agendar: antes a grade continuava ativa e o erro só aparecia depois de "Confirmar".
  // Agora a tela diz logo o motivo e o que fazer — com o mesmo verbo da Home ("Pedir").
  const semAulas = !!home && home.credits === 0;
  const aviso = !home
    ? null
    : home.pendingRequest
      ? {
          titulo: "Seu pedido está com o professor",
          texto: "Assim que ele aprovar, você agenda por aqui.",
          cta: null,
        }
      : home.nextBooking
        ? {
            titulo: "Todas as suas aulas já estão agendadas",
            texto: "Para marcar mais, peça mais aulas ao seu professor.",
            cta: "Pedir mais aulas",
          }
        : home.package || home.lastPackage
          ? { titulo: "Suas aulas acabaram", texto: "Peça mais aulas para continuar agendando.", cta: "Pedir mais aulas" }
          : { titulo: "Você ainda não tem aulas", texto: "Escolha um pacote e seu professor libera as aulas.", cta: "Pedir pacote" };

  if (semAulas && aviso) {
    return (
      <div className="page-container">
        <PageHeader title="AGENDAR AULA" back />
        <EmptyState
          icon={CalendarCheck}
          title={aviso.titulo}
          description={aviso.texto}
          ctaLabel={aviso.cta ?? undefined}
          onCta={aviso.cta ? () => navigate("/app/pacotes") : undefined}
        />
      </div>
    );
  }

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
                setEscolhido(i);
                setSelected(null);
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

      <h2 className="section-title mt-2 mb-3">Horários livres</h2>

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
            const on = selected?.slotId === s.slotId;
            return (
              <button
                key={s.slotId}
                type="button"
                disabled={full}
                onClick={() => setSelected(on ? null : s)}
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
            setSelected(null);
          }}
        />
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-[84px] px-5 pb-3 pt-6 bg-[linear-gradient(180deg,transparent,hsl(var(--background))_34%)] z-20 animate-bb-toast">
          <Button size="lg" className="w-full h-14" onClick={() => schedule.mutate(quandoEscolhido())} disabled={schedule.isPending}>
            {schedule.isPending ? "Confirmando…" : `Confirmar ${selected.time}`}
          </Button>
        </div>
      )}
    </div>
  );
}
