import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, CalendarClock, Clock3, MapPin, Repeat } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatTime, formatDate } from "@/lib/dateUtils";
import { arrivalMessage, equipmentItems, formatAddress, hasAddress, mapsUrl } from "@/lib/classGuidelines";
import {
  SlotTakenError,
  acceptSuggestion,
  cancelBooking,
  getCancelamentoDescontaAula,
  cancelarPedidoRemarcacao,
  getBookingDetail,
  getClassGuidelinesForBooking,
  getPedidoRemarcacaoPendente,
  getWhatsappDoProfessor,
} from "@/integrations/backend/api";
import { RemarcacaoSheet } from "@/components/RemarcacaoSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";

export default function StudentAulaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: detail, isLoading, isError, refetch } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => getBookingDetail(id!),
    enabled: !!id,
  });
  const booking = detail?.booking;
  // `profiles` is not readable by a student, so the professor's name only exists when the
  // history view could resolve it.
  const professor = detail?.adminName ?? "Seu professor";

  const { data: guidelines } = useQuery({
    queryKey: ["class-guidelines", booking?.adminId],
    queryFn: () => getClassGuidelinesForBooking(booking!),
    enabled: !!booking,
  });

  // ---- Pedido de remarcação pelo aluno de recorrência (0033) ----
  const [pickerOpen, setPickerOpen] = useState(false);
  const isRecorrencia = !!booking?.pacoteId;
  // Esta aula É um pedido (pendente e ligada a uma aula original ainda agendada).
  const isPedido = booking?.status === "pending_confirmation" && !!booking.replacementForBookingId;
  const { data: pedidoPendente } = useQuery({
    queryKey: ["pedido-remarcacao", id],
    queryFn: () => getPedidoRemarcacaoPendente(id!),
    enabled: !!booking && booking.status === "scheduled" && isRecorrencia,
  });
  const faltaMaisDe24h = !!booking && new Date(booking.startTime).getTime() - Date.now() >= 24 * 60 * 60 * 1000;
  // Aula agendada a menos de 6h: o banco recusa o cancelamento (`cancelar_minha_aula`, 0034). Antes o
  // botão aparecia mesmo assim e o aluno só descobria o erro depois de confirmar.
  const tarde6h = !!booking && booking.status === "scheduled" && new Date(booking.startTime).getTime() - Date.now() < 6 * 60 * 60 * 1000;
  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-professor", booking?.adminId],
    queryFn: () => getWhatsappDoProfessor(booking!.adminId),
    // Recorrência (< 24h) e qualquer aula agendada a menos de 6h (autosserviço inclusive).
    enabled: !!booking && ((isRecorrencia && !faltaMaisDe24h) || tarde6h),
    staleTime: 60 * 60 * 1000,
  });
  // Só quando o aluno abre a janela de cancelar. Sem resposta (falha), a janela diz o que sabe sem
  // prometer nada sobre a contagem.
  const { data: descontaAula } = useQuery({
    queryKey: ["cancelamento-desconta", id],
    queryFn: () => getCancelamentoDescontaAula(id!),
    enabled: confirmCancel && isRecorrencia,
    staleTime: 5 * 60 * 1000,
  });
  const invalidateAulas = () => {
    queryClient.invalidateQueries({ queryKey: ["student-home"] });
    queryClient.invalidateQueries({ queryKey: ["student-history"] });
    queryClient.invalidateQueries({ queryKey: ["pedido-remarcacao", id] });
    queryClient.invalidateQueries({ queryKey: ["booking", id] });
  };
  const cancelarPedido = useMutation({
    mutationFn: (pedidoId: string) => cancelarPedidoRemarcacao(pedidoId),
    onSuccess: () => {
      invalidateAulas();
      toast("Pedido cancelado · sua aula continua no horário original");
      if (isPedido) navigate("/app/home");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível cancelar o pedido."),
  });

  const cancel = useMutation({
    mutationFn: () => cancelBooking(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      // Na recorrência, cancelar pode contar como aula usada (depende da regra do pacote) — não
      // prometer que "voltou para o pacote".
      toast.warning(isRecorrencia ? "Aula cancelada" : "Aula cancelada · a aula voltou para o seu pacote");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível cancelar a aula."),
  });

  const accept = useMutation({
    mutationFn: () => acceptSuggestion(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      toast.success(`Horário confirmado para ${formatDateTime(booking!.suggestedStartTime!)}`);
    },
    onError: (err) =>
      err instanceof SlotTakenError
        ? toast.error(err.message, { action: { label: "Ver horários", onClick: () => navigate("/app/agendar") } })
        : toast.error(err instanceof Error ? err.message : "Não foi possível aceitar o novo horário."),
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="DETALHE DA AULA" back />
        <SkeletonCard height={220} />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="page-container">
        <PageHeader title="DETALHE DA AULA" back />
        <ErrorState title="Não foi possível carregar a aula" onRetry={() => refetch()} />
      </div>
    );
  }

  if (booking.status === "rejected_with_suggestion" && booking.suggestedStartTime && booking.suggestedEndTime) {
    return (
      <div className="page-container">
        <PageHeader title="SUGESTÃO DE HORÁRIO" back />

        <div className="rounded-[20px] p-[18px] bg-card border border-border mb-3 opacity-70">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Horário recusado
          </div>
          <div className="text-[17px] text-muted-foreground line-through">{formatDateTime(booking.startTime)}</div>
        </div>

        <div className="flex justify-center my-1 mb-3">
          <ArrowDown className="h-[22px] w-[22px] text-amber" />
        </div>

        <div className="rounded-[20px] p-5 bg-card border border-amber/35 mb-4">
          <div className="text-xs uppercase tracking-wide text-amber/80 font-semibold mb-2">
            Novo horário proposto
          </div>
          <div className="font-display text-4xl tracking-wide text-foreground leading-none">
            {formatDate(booking.suggestedStartTime).toUpperCase()}
          </div>
          <div className="text-base text-accent mt-0.5">
            {formatTime(booking.suggestedStartTime)} – {formatTime(booking.suggestedEndTime)}
          </div>
          {booking.teacherNote && (
            <>
              <div className="h-px bg-amber/20 my-3.5" />
              <div className="text-[13.5px] text-foreground/85 leading-relaxed">“{booking.teacherNote}”</div>
              <div className="text-xs text-muted-foreground mt-2">— {professor}</div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <Button size="lg" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? "Confirmando…" : "Aceitar novo horário"}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate("/app/agendar")}>
            Escolher outro horário
          </Button>
        </div>
      </div>
    );
  }

  const cancelable =
    (booking.status === "scheduled" || booking.status === "pending_confirmation") &&
    new Date(booking.startTime).getTime() > Date.now() &&
    !tarde6h;
  const aindaNaoComecou = new Date(booking.startTime).getTime() > Date.now();
  const passou =
    booking.status === "completed" ||
    booking.status === "no_show" ||
    new Date(booking.endTime).getTime() < Date.now();
  const arrival = guidelines ? arrivalMessage(guidelines.arrivalMinutes) : null;
  const equipment = guidelines ? equipmentItems(guidelines.equipment) : [];
  const address = guidelines && hasAddress(guidelines) ? formatAddress(guidelines) : null;

  return (
    <div className="page-container">
      <PageHeader title="DETALHE DA AULA" back />

      <div className="card-dark p-5 mb-3.5">
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge
            status={booking.status}
            audience="student"
            semRegistro={isAwaitingConfirmation(booking.status, booking.endTime)}
            agora={booking.status === "scheduled" && new Date(booking.startTime).getTime() <= Date.now() && new Date(booking.endTime).getTime() > Date.now()}
          />
          {(isPedido || pedidoPendente) && <Badge className="bg-amber/20 text-amber">Pedido em análise</Badge>}
          {booking.isReplacement && (
            <Badge className="bg-secondary text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" aria-hidden /> Reposição
            </Badge>
          )}
        </div>
        <div className="font-display text-[38px] tracking-wide text-foreground leading-none">
          {formatDate(booking.startTime)}
        </div>
        <div className="text-[15px] text-muted-foreground mt-0.5">
          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
        </div>
        <div className="h-px bg-border my-4" />
        <div className="flex items-center gap-2.5">
          <Avatar initials={professor.split(" ").map((n) => n[0]).slice(0, 2).join("")} size="sm" />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Professor</div>
            <div className="text-[14.5px] font-semibold text-foreground">{professor}</div>
          </div>
        </div>
      </div>

      {/* A página segue o momento da aula (decisão do Lucas, 2026-09-29):
          - pedido de outro horário pendente: a novidade sobe pra logo abaixo da data;
          - depois da aula: o recado do professor vem primeiro e a logística (chegada, equipamento,
            endereço), que só serve ANTES da aula, sai. */}
      {!passou && (
        <>
      {isPedido && (
        <div className="rounded-2xl p-4 bg-amber/10 border border-amber/30 mb-3.5">
          <div className="text-[15px] font-semibold text-amber">Pedido de remarcação</div>
          <div className="text-sm text-muted-foreground mt-1">
            Seu professor ainda vai aprovar este horário. Até lá, a aula continua no horário original.
          </div>
          <Button
            variant="secondary"
            className="w-full mt-3"
            onClick={() => cancelarPedido.mutate(booking.id)}
            disabled={cancelarPedido.isPending}
          >
            Cancelar pedido
          </Button>
        </div>
      )}

      {pedidoPendente && (
        <div className="rounded-2xl p-4 bg-amber/10 border border-amber/30 mb-3.5">
          <div className="text-[15px] font-semibold text-amber">Você pediu outro horário</div>
          <div className="text-base font-semibold text-foreground mt-1 first-letter:uppercase">
            {formatDate(pedidoPendente.startTime)} · {formatTime(pedidoPendente.startTime)}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">Aguardando o professor</div>
          <Button
            variant="secondary"
            className="w-full mt-3"
            onClick={() => cancelarPedido.mutate(pedidoPendente.id)}
            disabled={cancelarPedido.isPending}
          >
            Cancelar pedido
          </Button>
        </div>
      )}

        </>
      )}
      {passou && (
        <>
      {booking.teacherNote && booking.status !== "rejected" && (
        <div className="rounded-2xl p-4 bg-amber/[0.08] border border-amber/25 mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-amber/80 font-semibold mb-1.5">
            Observação do professor
          </h2>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{booking.teacherNote}</div>
        </div>
      )}

        </>
      )}
      {!passou && (
        <>
      {address && (
        <div className="card-dark p-4 mb-3.5">
          <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Onde será
          </h2>
          <div className="text-[14.5px] text-foreground/90 leading-snug">{address}</div>
          {guidelines?.referencePoint && (
            <div className="text-[12.5px] text-muted-foreground mt-1">Referência: {guidelines.referencePoint}</div>
          )}
          <a
            href={mapsUrl(guidelines!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center mt-2 text-[13px] font-semibold text-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver no mapa
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </div>
      )}

      {arrival && (
        <div className="flex items-start gap-2.5 rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <Clock3 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{arrival}</div>
        </div>
      )}

      {equipment.length > 0 && (
        <div className="mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Leve para esta aula</h2>
          <div className="flex flex-wrap gap-2">
            {equipment.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-secondary px-3 py-2">
                <div className="text-[13px] font-semibold text-foreground">{item.label}</div>
                {item.sub && <div className="text-xs text-muted-foreground">{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {guidelines?.notes && (
        <div className="rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Orientações</h2>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{guidelines.notes}</div>
        </div>
      )}

      {booking.teacherNote && booking.status !== "rejected" && (
        <div className="rounded-2xl p-4 bg-amber/[0.08] border border-amber/25 mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-amber/80 font-semibold mb-1.5">
            Observação do professor
          </h2>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{booking.teacherNote}</div>
        </div>
      )}

        </>
      )}
      {booking.status === "scheduled" && isRecorrencia && !pedidoPendente && !tarde6h && (
        faltaMaisDe24h ? (
          <Button variant="secondary" size="lg" className="w-full mb-3" onClick={() => setPickerOpen(true)}>
            <CalendarClock className="h-5 w-5" aria-hidden />
            Pedir outro horário
          </Button>
        ) : (
          <div className="text-sm text-muted-foreground mb-3">
            Faltam menos de 24 horas para esta aula. Para mudar o horário, fale com o professor
            {whatsapp ? (
              <>
                {" "}
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4"
                >
                  pelo WhatsApp
                </a>
              </>
            ) : (
              "."
            )}
          </div>
        )
      )}

      {tarde6h && aindaNaoComecou && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-3">
          <div className="text-[15px] font-semibold text-foreground mb-1">Faltam menos de 6 horas</div>
          <div className="text-sm text-muted-foreground">
            Não dá mais para cancelar ou mudar esta aula pelo app. Fale com o professor.
          </div>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-secondary text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Falar com o professor no WhatsApp
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          )}
        </div>
      )}

      {cancelable && !isPedido && (
        <Button variant="destructive" size="lg" className="w-full" onClick={() => setConfirmCancel(true)}>
          Cancelar aula
        </Button>
      )}

      {booking.status === "scheduled" && isRecorrencia && (
        <RemarcacaoSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          bookingId={booking.id}
          onDone={() => {
            setPickerOpen(false);
            invalidateAulas();
            toast.success("Pedido enviado · seu professor vai responder");
          }}
          onError={(err) =>
            err instanceof SlotTakenError
              ? toast.error("Esse horário acabou de ser ocupado. Escolha outro.")
              : toast.error(err instanceof Error ? err.message : "Não foi possível enviar o pedido.")
          }
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="CANCELAR AULA"
        description={
          isRecorrencia
            ? `A aula de ${formatDate(booking.startTime)} será cancelada. ${
                descontaAula === undefined
                  ? ""
                  : descontaAula
                    ? "Pela regra do seu pacote, cancelar desconta 1 aula. "
                    : "Pela regra do seu pacote, cancelar não desconta aula. "
              }Se quiser só mudar o horário, use "Pedir outro horário".`
            : `A aula de ${formatDate(booking.startTime)} será cancelada e a aula volta para o seu pacote.`
        }
        confirmLabel="Cancelar aula"
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
