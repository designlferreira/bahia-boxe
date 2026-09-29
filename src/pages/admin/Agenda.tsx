import { useState } from "react";
import { addDays, isSameDay, startOfWeek } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateShort,
  formatDayNumber,
  formatQuando,
  formatTime,
  formatWeekdayLong,
  formatWeekdayShort,
  isoDateOnly,
} from "@/lib/dateUtils";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { useLessonActions } from "@/hooks/useLessonActions";
import { usePendingActions, type PendenteAlvo } from "@/hooks/usePendingActions";
import {
  getAdminAgendaForDay,
  getAdminSettings,
  getAwaitingConfirmationBookings,
  getPedidosPendentes,
  type TimelineEntry,
  VINCULO_LABEL,
} from "@/integrations/backend/api";
import { StatusBadge } from "@/components/StatusBadge";

const DAY_COUNT = 7;

/** A semana de verdade, de segunda a domingo (decisão do Lucas, 2026-09-28). Antes era "os próximos
 *  7 dias a partir de hoje" — ontem só aparecia voltando uma semana inteira. */
const inicioDaSemana = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

/** Estado de navegação vindo do banner "aula(s) aguardando confirmação" do Dashboard — leva direto
 *  pra semana/dia da pendência mais antiga, em vez de sempre abrir em "hoje" (CLAUDE.md, "Agenda
 *  com navegação livre"). */
interface AgendaNavState {
  date?: string;
}

/** Mesmo significado de cor do app (CLAUDE.md, "Cor com significado"): âmbar = depende do
 *  professor, neutro = feito, branco = vem pela frente, vermelho = falta/recusa. */
function dotClassFor(entry: TimelineEntry) {
  const status = entry.booking!.status;
  if (status === "scheduled" && isAwaitingConfirmation(status, entry.booking!.endTime)) return "bg-amber";
  switch (status) {
    case "scheduled":
      return "bg-foreground";
    case "completed":
      return "bg-muted-foreground";
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
  const location = useLocation();
  const queryClient = useQueryClient();

  // Data-alvo vinda do banner de pendência do Dashboard, ou "hoje" por padrão — lida só na
  // primeira renderização (inicializador preguiçoso do useState), nunca mais depois: navegar
  // dentro da própria Agenda não deve reagir a um location.state que só existe nesse primeiro salto.
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const target = (location.state as AgendaNavState | null)?.date;
    return target ? new Date(target) : new Date();
  });
  const weekStart = inicioDaSemana(selectedDate);
  const hoje = new Date();

  const days = Array.from({ length: DAY_COUNT }, (_, i) => addDays(weekStart, i));

  // Trocar de semana mantém o mesmo dia da semana (quarta → quarta), em vez de pular pro 1º dia.
  const goToPreviousWeek = () => setSelectedDate((d) => addDays(d, -DAY_COUNT));
  const goToNextWeek = () => setSelectedDate((d) => addDays(d, DAY_COUNT));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-agenda", profile?.id, selectedDate.toDateString()],
    queryFn: () => getAdminAgendaForDay(profile!.id, selectedDate),
    enabled: !!profile,
  });

  // Sem limite de quantos dias atrás (CLAUDE.md, "Agenda com navegação livre") — mesma query do
  // banner de pendência do Dashboard, aqui só pra marcar visualmente os dias da semana visível que
  // têm aula aguardando confirmação, pra o professor não precisar navegar semana por semana
  // procurando. Busca TODAS as pendências do professor (não só as da semana visível): o conjunto é
  // sempre pequeno (são exceções, não volume normal) e assim funciona qualquer que seja a semana
  // mostrada, sem precisar refazer a busca a cada navegação.
  const awaitingQuery = useQuery({
    queryKey: ["awaiting-confirmation-bookings", profile?.id],
    queryFn: () => getAwaitingConfirmationBookings(profile!.id),
    enabled: !!profile,
  });
  // Pedidos sem resposta também marcam o dia — antes só a aula sem registro marcava, e o pedido de
  // amanhã ficava sem sinal nenhum na faixa da semana.
  const pedidosQuery = useQuery({
    queryKey: ["agenda-pedidos-pendentes", profile?.id],
    queryFn: () => getPedidosPendentes(profile!.id),
    enabled: !!profile,
  });
  const diasComPendencia = new Set(
    [...(awaitingQuery.data ?? []), ...(pedidosQuery.data ?? [])].map((b) => isoDateOnly(b.startTime)),
  );
  const nAulas = data?.filter((t) => !t.free).length ?? 0;

  // Dia vazio: publicar horários só faz sentido no autosserviço e num dia que ainda não passou.
  const { data: settings } = useQuery({
    queryKey: ["admin-settings", profile?.id],
    queryFn: () => getAdminSettings(profile!.id),
    enabled: !!profile,
  });
  const diaPassado = isoDateOnly(selectedDate) < isoDateOnly(hoje);
  const podePublicar = !diaPassado && (settings?.modoAgendamento ?? "autosservico") === "autosservico";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["awaiting-confirmation-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-pedidos-pendentes"] });
  }

  const actions = useLessonActions(invalidate);

  // Aprovar/recusar: mesmo hook do Painel (trava durante o envio, desfazer, remarcação com de -> para).
  const pendentes = usePendingActions(profile?.id ?? "", invalidate);

  if (!profile) return null;

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">AGENDA</h1>
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="flex-1 text-[13px] text-muted-foreground">
          {formatDate(selectedDate)} · {nAulas === 1 ? "1 aula" : `${nAulas} aulas`}
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate("/admin/disponibilidade")}>
          Disponibilidade
        </Button>
      </div>

      {/* Setas e "Hoje" numa linha própria: assim os 7 dias cabem na largura toda (cada um com
          ~45px de toque) sem rolagem lateral — antes só uns 4 dos 7 apareciam no celular. */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={goToPreviousWeek}
          aria-label="Semana anterior"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" aria-hidden />
        </button>
        <div className="flex-1 text-center text-sm text-muted-foreground tabular-nums">
          {formatDateShort(days[0])} – {formatDateShort(days[DAY_COUNT - 1])}
        </div>
        {!isSameDay(selectedDate, hoje) && (
          <Button variant="secondary" size="sm" className="px-3" onClick={() => setSelectedDate(new Date())}>
            Hoje
          </Button>
        )}
        <button
          type="button"
          onClick={goToNextWeek}
          aria-label="Próxima semana"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4 text-foreground" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {days.map((d) => {
          const on = isSameDay(selectedDate, d);
          const ehHoje = isSameDay(hoje, d);
          const pendencia = diasComPendencia.has(isoDateOnly(d));
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setSelectedDate(d)}
              aria-label={`${formatWeekdayLong(d)}, dia ${formatDayNumber(d)}${ehHoje ? ", hoje" : ""}${pendencia ? " — tem algo para resolver" : ""}`}
              aria-pressed={on}
              className={cn(
                "relative min-w-0 py-2 rounded-2xl border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary border-primary" : ehHoje ? "bg-secondary border-foreground/50" : "bg-secondary border-border",
              )}
            >
              {/* No dia selecionado (fundo vermelho) a bolinha âmbar sumia (2,25:1) — vira branca. */}
              {pendencia && (
                <span
                  aria-hidden
                  className={cn("absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full", on ? "bg-primary-foreground" : "bg-amber")}
                />
              )}
              <div aria-hidden className={cn("text-xs", on ? "text-primary-foreground" : "text-muted-foreground")}>
                {formatWeekdayShort(d)}
              </div>
              <div
                aria-hidden
                className={cn("font-display text-[22px] leading-tight", on ? "text-primary-foreground" : "text-foreground")}
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

      {/* Dia sem aula nem horário publicado: antes a tela ficava em branco abaixo da semana. */}
      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          icon={CalendarX}
          title={diaPassado ? "Nenhuma aula neste dia" : "Nenhum horário neste dia"}
          description={
            podePublicar
              ? "Publique seus horários para os alunos poderem agendar."
              : diaPassado
                ? "Não houve aula nem horário publicado."
                : "Nenhuma aula marcada para este dia."
          }
          ctaLabel={podePublicar ? "Publicar horários" : undefined}
          onCta={podePublicar ? () => navigate("/admin/disponibilidade") : undefined}
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col">
          {data.map((entry) => {
            const booking = entry.booking;
            const awaiting = !entry.free && booking!.status === "scheduled" && isAwaitingConfirmation(booking!.status, booking!.endTime);

            return (
              <div key={entry.hour} className="flex gap-3 min-h-[74px]">
                <div className="w-11 shrink-0 text-right pt-0.5">
                  <div className="text-xs text-muted-foreground tabular-nums">{entry.hour}</div>
                </div>
                <div className="w-0.5 bg-border shrink-0 relative">
                  <span
                    className={cn(
                      "absolute -left-[3px] top-1.5 h-2 w-2 rounded-full transition-colors",
                      entry.free ? "bg-muted-foreground/50" : dotClassFor(entry),
                    )}
                  />
                </div>
                <div className="flex-1 pb-3">
                  {entry.free ? (
                    <div className="border border-dashed border-muted-foreground/40 rounded-2xl p-3.5 text-[13px] text-muted-foreground">
                      Horário livre
                    </div>
                  ) : (
                    // O cartão NÃO é um botão: antes era, e os botões de ação ficavam dentro dele
                    // (HTML inválido — leitor de tela anunciava errado, teclado se perdia, e um toque
                    // podia abrir o detalhe em vez de acionar a ação). Só o cabeçalho abre o detalhe.
                    <div
                      className={cn(
                        "bg-card border rounded-2xl p-3.5",
                        booking?.status === "pending_confirmation" || awaiting ? "border-amber/35" : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/aula/${booking!.id}`)}
                        className="w-full min-h-11 text-left flex justify-between items-start gap-2 mb-2 rounded-md active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div>
                          <div className="text-[14.5px] font-semibold text-foreground flex items-center gap-1.5">
                            {entry.studentName}
                            {entry.vinculo && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground whitespace-nowrap">
                                {VINCULO_LABEL[entry.vinculo]}
                              </span>
                            )}
                          </div>
                          {entry.vinculo === "pedido_remarcacao" && entry.antecessorInicio ? (
                            // Pedido de remarcação: de onde pra onde, como no painel.
                            <div className="text-[13px] text-muted-foreground mt-0.5">
                              <span className="sr-only">de </span>
                              <span className="line-through">{formatQuando(entry.antecessorInicio)}</span>
                              <span aria-hidden> → </span>
                              <span className="sr-only">para </span>
                              <span className="text-foreground">
                                {formatTime(booking!.startTime)} – {formatTime(booking!.endTime)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[13px] text-muted-foreground mt-0.5">
                              {formatTime(booking!.startTime)} – {formatTime(booking!.endTime)}
                            </div>
                          )}
                        </div>
                        <StatusBadge status={booking!.status} semRegistro={awaiting} />
                        <span className="sr-only">. Ver detalhes</span>
                      </button>

                      {booking?.status === "pending_confirmation" && (
                        <div className="flex gap-2">
                          <Button
                            variant="soft"
                            size="sm"
                            className="flex-1"
                            onClick={() => pendentes.requestApprove(alvoDe(entry))}
                            disabled={pendentes.isBusy(booking.id)}
                            aria-label={`Aprovar: ${entry.studentName}, ${entry.hour}`}
                          >
                            Aprovar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={() => pendentes.requestReject(alvoDe(entry))}
                            disabled={pendentes.isBusy(booking.id)}
                            aria-label={`Recusar: ${entry.studentName}, ${entry.hour}`}
                          >
                            Recusar
                          </Button>
                        </div>
                      )}

                      {booking?.status === "scheduled" && (
                        <div className="flex flex-col gap-2">
                          {awaiting && (
                            <div className="flex gap-2">
                              <Button
                                variant="soft"
                                size="sm"
                                className="flex-1"
                                disabled={actions.isBusy(booking.id)}
                                onClick={() => actions.openComplete(booking, entry.studentName ?? "Aluno")}
                                aria-label={`Aconteceu: ${entry.studentName}, ${entry.hour}`}
                              >
                                Aconteceu
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                                disabled={actions.isBusy(booking.id)}
                                onClick={() => actions.openNoShow(booking, entry.studentName ?? "Aluno")}
                                aria-label={`Faltou: ${entry.studentName}, ${entry.hour}`}
                              >
                                Faltou
                              </Button>
                            </div>
                          )}
                          {/* Aula que já passou: a única pergunta é "aconteceu ou faltou?" (decisão do
                              Lucas, 2026-09-28). Remarcar/Cancelar/reposição continuam no detalhe, a um
                              toque no nome — no cartão viravam uma parede de 5 botões. */}
                          {!awaiting && (
                            <>
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="flex-1"
                                  disabled={actions.isBusy(booking.id)}
                                  onClick={() => actions.openReagendar(booking, entry.studentName ?? "Aluno")}
                                  aria-label={`Remarcar: ${entry.studentName}, ${entry.hour}`}
                                >
                                  Remarcar
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="flex-1"
                                  disabled={actions.isBusy(booking.id)}
                                  onClick={() => actions.openCancelar(booking, entry.studentName ?? "Aluno")}
                                  aria-label={`Cancelar: ${entry.studentName}, ${entry.hour}`}
                                >
                                  Cancelar
                                </Button>
                              </div>
                              {!booking.isReplacement && (
                                <button
                                  type="button"
                                  onClick={() => actions.openReplacement(booking, entry.studentName ?? "Aluno")}
                                  aria-label={`Marcar como reposição: ${entry.studentName}, ${entry.hour}`}
                                  className="self-start text-[13px] text-muted-foreground underline underline-offset-2 min-h-11 flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  Marcar como reposição
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendentes.dialogs}

      {actions.dialogs}
    </div>
  );
}

function alvoDe(entry: TimelineEntry): PendenteAlvo {
  return {
    id: entry.booking!.id,
    studentName: entry.studentName ?? "Aluno",
    startTime: entry.booking!.startTime,
    endTime: entry.booking!.endTime,
    antecessorInicio: entry.antecessorInicio ?? null,
  };
}
