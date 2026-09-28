import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RejectBookingModal } from "@/components/RejectBookingModal";
import { approveBooking, devolverParaPendente, rejectBooking } from "@/integrations/backend/api";
import { formatDate, formatTime } from "@/lib/dateUtils";

/** Um pendente como o painel e a agenda o conhecem. */
export interface PendenteAlvo {
  id: string;
  studentName: string;
  startTime: string;
  endTime: string;
  /** Presente = é um pedido de remarcação do aluno (0033); é o horário da aula original. */
  antecessorInicio?: string | null;
}

const quando = (iso: string) => `${formatDate(iso)} · ${formatTime(iso)}`;
const primeiroNome = (nome: string) => nome.split(" ")[0];

/**
 * Aprovar / recusar um pendente — o MESMO comportamento no painel e na agenda (lição do
 * `useLessonActions` no CLAUDE.md: a ação vive num lugar só, as duas telas só renderizam).
 *
 * - Agendamento comum: aprovar é imediato, com "Desfazer" no aviso (volta a pendente).
 * - Pedido de remarcação: aprovar MOVE a aula, então pede confirmação mostrando de -> para. Não tem
 *   desfazer: reverter uma remarcação aprovada precisaria de outra função no banco.
 * - Recusar abre a janela de recusa; num pedido de remarcação ela não oferece sugestão de horário.
 * - `isBusy(id)`: trava os botões daquele pendente durante o envio (toque duplo enviava duas vezes).
 */
export function usePendingActions(adminId: string, invalidate: () => void) {
  const [confirmRemarcacao, setConfirmRemarcacao] = useState<PendenteAlvo | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendenteAlvo | null>(null);

  const approve = useMutation({
    mutationFn: (alvo: PendenteAlvo) => approveBooking(alvo.id),
    onSuccess: (_r, alvo) => {
      invalidate();
      if (alvo.antecessorInicio) {
        toast.success(`Remarcação aprovada · ${primeiroNome(alvo.studentName)}: ${quando(alvo.startTime)}`);
        return;
      }
      toast.success(`Aula de ${primeiroNome(alvo.studentName)} aprovada`, {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: () =>
            devolverParaPendente(alvo.id)
              .then(() => {
                invalidate();
                toast("Aprovação desfeita · a aula voltou a aguardar sua aprovação");
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : "Não foi possível desfazer.")),
        },
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível aprovar."),
  });

  const reject = useMutation({
    mutationFn: ({ alvo, note, start, end }: { alvo: PendenteAlvo; note: string; start: Date | null; end: Date | null }) =>
      rejectBooking(alvo.id, note, start?.toISOString() ?? null, end?.toISOString() ?? null),
    onSuccess: (_r, { alvo, start }) => {
      invalidate();
      setRejectTarget(null);
      if (alvo.antecessorInicio) toast.warning("Remarcação recusada · a aula original continua valendo");
      else toast.warning(start ? "Recusado com sugestão de horário" : "Agendamento recusado");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível recusar."),
  });

  function requestApprove(alvo: PendenteAlvo) {
    if (alvo.antecessorInicio) setConfirmRemarcacao(alvo);
    else approve.mutate(alvo);
  }

  const isBusy = (id: string) =>
    (approve.isPending && approve.variables?.id === id) || (reject.isPending && reject.variables?.alvo.id === id);

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirmRemarcacao}
        onOpenChange={(o) => !o && setConfirmRemarcacao(null)}
        title="APROVAR REMARCAÇÃO?"
        description={
          confirmRemarcacao
            ? `A aula de ${confirmRemarcacao.studentName} passa de ${quando(confirmRemarcacao.antecessorInicio!)} para ${quando(confirmRemarcacao.startTime)}.`
            : ""
        }
        confirmLabel="Aprovar"
        onConfirm={() => {
          if (confirmRemarcacao) approve.mutate(confirmRemarcacao);
          setConfirmRemarcacao(null);
        }}
      />
      {rejectTarget && (
        <RejectBookingModal
          open={!!rejectTarget}
          onOpenChange={(o) => !o && setRejectTarget(null)}
          adminId={adminId}
          studentName={rejectTarget.studentName}
          timeLabel={
            rejectTarget.antecessorInicio
              ? quando(rejectTarget.startTime)
              : `${formatDate(rejectTarget.startTime)}, ${formatTime(rejectTarget.startTime)} – ${formatTime(rejectTarget.endTime)}`
          }
          remarcacao={!!rejectTarget.antecessorInicio}
          originalLabel={rejectTarget.antecessorInicio ? quando(rejectTarget.antecessorInicio) : null}
          onConfirm={(note, start, end) => reject.mutate({ alvo: rejectTarget, note, start, end })}
        />
      )}
    </>
  );

  return { requestApprove, requestReject: setRejectTarget, isBusy, dialogs };
}
