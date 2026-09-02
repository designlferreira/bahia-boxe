import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReplacementPickerSheet } from "@/components/ReplacementPickerSheet";
import {
  completeBooking,
  getAdminSettings,
  markAsReplacement,
  markNoShow,
  undoLessonAction,
} from "@/integrations/backend/api";
import type { Booking } from "@/integrations/backend/types";

const UNDO_TOAST_MS = 9000;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

interface Target {
  booking: Booking;
  studentName: string;
}

/**
 * Concluir/falta/desfazer/reposição — a mesma lógica de domínio, usada tanto na lista da Agenda
 * quanto na tela de Detalhes da aula, pra não duplicar as mutations e os diálogos de confirmação
 * em dois lugares.
 */
export function useLessonActions(onChanged: () => void) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [confirmComplete, setConfirmComplete] = useState<Target | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState<Target | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<Target | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["admin-settings", profile?.id],
    queryFn: () => getAdminSettings(profile!.id),
    enabled: !!profile,
  });
  const noShowConsumesClass = settings?.noShowConsumesClass ?? true;

  function after() {
    onChanged();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const undo = useMutation({
    mutationFn: (bookingId: string) => undoLessonAction(bookingId),
    onSuccess: () => {
      after();
      toast("Desfeito");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível desfazer.")),
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeBooking(id),
    onSuccess: (_r, id) => {
      after();
      toast.success("Aula concluída com sucesso.", {
        duration: UNDO_TOAST_MS,
        action: { label: "Desfazer", onClick: () => undo.mutate(id) },
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível concluir a aula.")),
  });

  const noShow = useMutation({
    mutationFn: (id: string) => markNoShow(id),
    onSuccess: (_r, id) => {
      after();
      toast.warning("Falta registrada.", {
        duration: UNDO_TOAST_MS,
        action: { label: "Desfazer", onClick: () => undo.mutate(id) },
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível registrar a falta.")),
  });

  const replacement = useMutation({
    mutationFn: ({ bookingId, replacesBookingId }: { bookingId: string; replacesBookingId: string }) =>
      markAsReplacement(bookingId, replacesBookingId),
    onSuccess: () => {
      after();
      setReplacementTarget(null);
      toast.success("Marcada como reposição — sem cobrar crédito novo");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível marcar como reposição.")),
  });

  function isBusy(bookingId: string) {
    return (
      (complete.isPending && complete.variables === bookingId) ||
      (noShow.isPending && noShow.variables === bookingId) ||
      (undo.isPending && undo.variables === bookingId)
    );
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirmComplete}
        onOpenChange={(o) => !o && setConfirmComplete(null)}
        title="CONCLUIR AULA?"
        description="Ao confirmar, você estará declarando que esta aula aconteceu normalmente. O crédito referente a esta aula será consumido do aluno."
        confirmLabel="Confirmar conclusão"
        cancelLabel="Cancelar"
        tone="default"
        onConfirm={() => confirmComplete && complete.mutate(confirmComplete.booking.id)}
      />

      <ConfirmDialog
        open={!!confirmNoShow}
        onOpenChange={(o) => !o && setConfirmNoShow(null)}
        title="REGISTRAR FALTA?"
        description={`Confirme que o aluno não compareceu a esta aula.\n\n${
          noShowConsumesClass
            ? "De acordo com as configurações atuais, o crédito desta aula será consumido."
            : "De acordo com as configurações atuais, o crédito desta aula será mantido."
        }`}
        confirmLabel="Registrar falta"
        cancelLabel="Cancelar"
        tone="default"
        onConfirm={() => confirmNoShow && noShow.mutate(confirmNoShow.booking.id)}
      />

      {replacementTarget && (
        <ReplacementPickerSheet
          open={!!replacementTarget}
          onOpenChange={(o) => !o && setReplacementTarget(null)}
          studentId={replacementTarget.booking.studentId}
          studentName={replacementTarget.studentName}
          onPick={(replacesId) =>
            replacement.mutate({ bookingId: replacementTarget.booking.id, replacesBookingId: replacesId })
          }
        />
      )}
    </>
  );

  return {
    isBusy,
    openComplete: (booking: Booking, studentName: string) => setConfirmComplete({ booking, studentName }),
    openNoShow: (booking: Booking, studentName: string) => setConfirmNoShow({ booking, studentName }),
    openReplacement: (booking: Booking, studentName: string) => setReplacementTarget({ booking, studentName }),
    undo: (bookingId: string) => undo.mutate(bookingId),
    undoPending: undo.isPending,
    dialogs,
  };
}
