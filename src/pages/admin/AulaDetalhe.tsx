import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Repeat } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { formatDate, formatQuando, formatTime } from "@/lib/dateUtils";
import { useLessonActions } from "@/hooks/useLessonActions";
import { usePendingActions } from "@/hooks/usePendingActions";
import { useAuth } from "@/context/AuthContext";
import { getAdminBookingDetail, VINCULO_LABEL } from "@/integrations/backend/api";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminAulaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [outrasAbertas, setOutrasAbertas] = useState(false);

  const { data: detail, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () => getAdminBookingDetail(id!),
    enabled: !!id,
  });
  const booking = detail?.booking;
  const studentName = detail?.studentName ?? "Aluno";
  const remarcacoes = detail?.remarcacoes ?? 0;
  const vinculo = detail?.vinculo ?? null;
  const antecessorInicio = detail?.antecessorInicio ?? null;
  const { profile } = useAuth();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-pedidos-pendentes"] });
  };
  const actions = useLessonActions(invalidate);
  // Pedido pendente (novo horário ou remarcação): o mesmo Aprovar/Recusar do painel e da agenda.
  // Antes o detalhe não tinha botão nenhum pra esse estado — quem chegava por uma notificação
  // ficava num beco sem saída.
  const pendentes = usePendingActions(profile?.id ?? "", invalidate);

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

  const awaiting = booking.status === "scheduled" && isAwaitingConfirmation(booking.status, booking.endTime);
  const initials = studentName.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="page-container">
      <PageHeader title="DETALHE DA AULA" back />

      <div className="card-dark p-5 mb-3.5">
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status={booking.status} semRegistro={awaiting} />
          {vinculo && (
            <Badge className="bg-secondary text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {VINCULO_LABEL[vinculo]}
            </Badge>
          )}
          {remarcacoes > 0 && (
            <Badge className="bg-secondary text-muted-foreground flex items-center gap-1">
              <History className="h-3 w-3" /> Remarcada {remarcacoes}x
            </Badge>
          )}
        </div>
        <div className="font-display text-[38px] tracking-wide text-foreground leading-none">
          {formatDate(booking.startTime)}
        </div>
        <div className="text-[15px] text-muted-foreground mt-0.5">
          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
        </div>
        {booking.status === "pending_confirmation" && antecessorInicio && (
          // Pedido de remarcação: de onde pra onde, como no painel.
          <div className="text-sm text-muted-foreground mt-2">
            Antes: <span className="line-through">{formatQuando(antecessorInicio)}</span>
          </div>
        )}
        <div className="h-px bg-border my-4" />
        <button
          type="button"
          onClick={() => navigate(`/admin/alunos/${booking.studentId}`)}
          className="flex items-center gap-2.5 -m-1 p-1 rounded-xl active:scale-[0.98] transition-transform"
        >
          <Avatar initials={initials} size="sm" />
          <div className="text-left">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aluno</div>
            <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
          </div>
        </button>
      </div>

      {booking.teacherNote && (
        <div className="rounded-2xl p-4 bg-amber/[0.08] border border-amber/25 mb-3.5">
          <div className="text-[11.5px] uppercase tracking-wide text-amber/80 font-semibold mb-1.5">Sua observação</div>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{booking.teacherNote}</div>
        </div>
      )}

      {booking.status === "pending_confirmation" && (
        <div className="flex gap-2.5">
          <Button
            variant="soft"
            size="lg"
            className="flex-1"
            disabled={pendentes.isBusy(booking.id)}
            onClick={() =>
              pendentes.requestApprove({
                id: booking.id,
                studentName,
                startTime: booking.startTime,
                endTime: booking.endTime,
                antecessorInicio,
              })
            }
          >
            Aprovar
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={pendentes.isBusy(booking.id)}
            onClick={() =>
              pendentes.requestReject({
                id: booking.id,
                studentName,
                startTime: booking.startTime,
                endTime: booking.endTime,
                antecessorInicio,
              })
            }
          >
            Recusar
          </Button>
        </div>
      )}

      {booking.status === "scheduled" && (
        <div className="flex flex-col gap-2.5">
          {awaiting && (
            <div className="flex gap-2.5">
              <Button
                variant="soft"
                size="lg"
                className="flex-1"
                disabled={actions.isBusy(booking.id)}
                onClick={() => actions.openComplete(booking, studentName)}
              >
                Aconteceu
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={actions.isBusy(booking.id)}
                onClick={() => actions.openNoShow(booking, studentName)}
              >
                Faltou
              </Button>
            </div>
          )}
          {/* Aula que já passou sem registro: a pergunta é uma só (aconteceu ou faltou?). Remarcar,
              Cancelar e reposição continuam aqui, atrás de "Outras ações" (decisão do Lucas,
              2026-09-29) — nada some, só sai do caminho, como no cartão da agenda. */}
          {awaiting && !outrasAbertas ? (
            <Button variant="ghost" size="lg" className="w-full" onClick={() => setOutrasAbertas(true)} aria-expanded={false}>
              Outras ações
            </Button>
          ) : (
            <>
              <div className="flex gap-2.5">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  disabled={actions.isBusy(booking.id)}
                  onClick={() => actions.openReagendar(booking, studentName)}
                >
                  Remarcar
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1"
                  disabled={actions.isBusy(booking.id)}
                  onClick={() => actions.openCancelar(booking, studentName)}
                >
                  Cancelar aula
                </Button>
              </div>
              {!booking.isReplacement && (
                <Button variant="secondary" size="lg" onClick={() => actions.openReplacement(booking, studentName)}>
                  Marcar como reposição
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* CLAUDE.md, "Desfazer só existe por 9 segundos" — a RPC undo_lesson_action não tem janela
          de tempo (continua válida enquanto a transição em si for válida), mas até aqui o único
          ponto de entrada era a ação do toast logo após concluir/registrar falta. Caminho
          permanente: disponível sempre que o status ainda for completed/no_show, não só nos
          primeiros 9 segundos. */}
      {(booking.status === "completed" || booking.status === "no_show") && (
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={actions.isBusy(booking.id)}
          onClick={() => setConfirmUndo(true)}
        >
          Desfazer {booking.status === "completed" ? "conclusão" : "falta"}
        </Button>
      )}

      <ConfirmDialog
        open={confirmUndo}
        onOpenChange={setConfirmUndo}
        title="DESFAZER?"
        description={
          booking.status === "completed"
            ? "A aula volta a ficar aguardando confirmação, desfazendo a conclusão registrada. O saldo do aluno se ajusta de acordo."
            : "A aula volta a ficar aguardando confirmação, desfazendo a falta registrada. O saldo do aluno se ajusta de acordo."
        }
        confirmLabel="Desfazer"
        cancelLabel="Cancelar"
        tone="default"
        onConfirm={() => {
          actions.undo(booking.id);
          setConfirmUndo(false);
        }}
      />

      {actions.dialogs}
      {pendentes.dialogs}
    </div>
  );
}
