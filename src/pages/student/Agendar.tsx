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
  const livresDoDia = (slots ?? []).filter((s) => s.status === "free");
  const livresHoje = slots ? livresDoDia.length : null;
  // Próximo dia (depois do escolhido, dando a volta) que tem horário livre — "Ver próximo dia" antes
  // pulava às cegas, inclusive pra outro dia vazio.
  const proximoComLivre = semana
    ? (Array.from({ length: DAY_COUNT - 1 }, (_, k) => (dayOffset + 1 + k) % DAY_COUNT).find((i) => livresNoDia(i) > 0) ?? -1)
    : -1;

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

  /** "Amanhã, 29 set" / "Quinta-feira, 01 out". */
  function diaPorExtenso(d: Date) {
    return `${formatRelativeDay(d)}, ${formatDateShort(d)}`;
  }

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
        // Mesmo vocabulário da Home: aulas, não "crédito(s) disponível(is)" (decisão do Lucas).
        subtitle={
          home
            ? home.credits === 1
              ? "Você pode agendar mais 1 aula"
              : `Você pode agendar mais ${home.credits} aulas`
            : undefined
        }
      />

      {/* Mesma faixa da agenda do professor: os 7 dias cabem na tela (sem rolagem) e cada dia diz se
          tem horário livre — antes o aluno procurava dia por dia. */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {days.map((d, i) => {
          const on = dayOffset === i;
          const livres = livresNoDia(i);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => {
                setEscolhido(i);
                setSelected(null);
              }}
              aria-label={`${formatWeekdayLong(d)}, dia ${formatDayNumber(d)}${i === 0 ? ", amanhã" : ""}${
                semana ? (livres ? ` — ${livres === 1 ? "1 horário livre" : `${livres} horários livres`}` : " — sem horário livre") : ""
              }`}
              aria-pressed={on}
              className={cn(
                "relative min-w-0 pt-1.5 pb-3 rounded-2xl border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary border-primary" : "bg-secondary border-border",
              )}
            >
              <div aria-hidden className={cn("text-xs", on ? "text-primary-foreground" : "text-muted-foreground")}>
                {formatWeekdayShort(d)}
              </div>
              <div
                aria-hidden
                className={cn(
                  "font-display text-[22px] leading-tight",
                  on ? "text-primary-foreground" : semana && !livres ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {formatDayNumber(d)}
              </div>
              {livres > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full",
                    on ? "bg-primary-foreground" : "bg-foreground",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* O dia escolhido por extenso ("Amanhã, 29 set") — a faixa só tem o número. */}
      <div className="mb-3" aria-live="polite">
        <h2 className="section-title">{diaPorExtenso(selectedDate)}</h2>
        {livresHoje !== null && (
          <div className="text-sm text-muted-foreground">
            {livresHoje === 0 ? "Nenhum horário livre" : livresHoje === 1 ? "1 horário livre" : `${livresHoje} horários livres`}
          </div>
        )}
      </div>

      {(isLoading || !adminId) && (
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[66px] rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      )}

      {/* Só os livres: horário ocupado não é escolha nenhuma pro aluno (decisão do Lucas, 2026-09-28). */}
      {!isLoading && livresDoDia.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {livresDoDia.map((s) => {
            const on = selected?.slotId === s.slotId;
            return (
              <button
                key={s.slotId}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected(on ? null : s)}
                className={cn(
                  "h-[66px] rounded-2xl border text-left px-3.5 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-primary/15 border-primary" : "bg-secondary border-border",
                )}
              >
                <div className="text-base font-semibold text-foreground">{s.time}</div>
                <div className={cn("text-xs", on ? "text-[hsl(var(--red-text))]" : "text-muted-foreground")}>
                  {on ? "Escolhido" : "Livre"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && slots && livresDoDia.length === 0 && (
        <EmptyState
          icon={CalendarSearch}
          title="Sem horários livres neste dia"
          description={
            proximoComLivre >= 0
              ? "Escolha outro dia — os que têm horário estão marcados com um ponto."
              : "Seu professor ainda não abriu horários nos próximos dias."
          }
          ctaLabel={proximoComLivre >= 0 ? `Ver ${diaPorExtenso(days[proximoComLivre])}` : undefined}
          ctaVariant="secondary"
          onCta={
            proximoComLivre >= 0
              ? () => {
                  setEscolhido(proximoComLivre);
                  setSelected(null);
                }
              : undefined
          }
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
