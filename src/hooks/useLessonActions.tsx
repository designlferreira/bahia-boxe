import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReplacementPickerSheet } from "@/components/ReplacementPickerSheet";
import { RescheduleSheet } from "@/components/RescheduleSheet";
import { CancelLessonSheet } from "@/components/CancelLessonSheet";
import {
  cancelarAula,
  completeBooking,
  getAdminSettings,
  getRegraDeConsumo,
  markAsReplacement,
  markNoShow,
  reagendarAula,
  undoLessonAction,
} from "@/integrations/backend/api";
import type { RegraDeConsumo } from "@/integrations/backend/api";
import type { Booking } from "@/integrations/backend/types";
import { formatDateTime } from "@/lib/dateUtils";

const UNDO_TOAST_MS = 9000;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

interface Target {
  booking: Booking;
  studentName: string;
}

/** Falta/cancelamento: a janela precisa da regra DESTA aula (null = não deu pra ler). */
interface TargetComRegra extends Target {
  regra: RegraDeConsumo | null;
}

/** Texto da consequência da falta, dizendo de onde vem a regra. */
function textoFalta(regra: RegraDeConsumo | null) {
  if (!regra) return "O que acontece com a aula segue a regra do pacote do aluno.";
  if (regra.origem === "reposicao") return "É uma reposição: a falta não desconta aula.";
  const fonte = regra.origem === "pacote" ? "Pela regra deste pacote" : "Pela sua configuração";
  if (regra.falta) return `${fonte}, a falta desconta 1 aula do aluno.`;
  // Recorrência: a aula fica "a repor". Autosserviço: a aula simplesmente volta pro saldo de agendar.
  return regra.origem === "sem_pacote"
    ? `${fonte}, a falta não desconta aula: ela continua disponível para o aluno agendar.`
    : `${fonte}, a falta não desconta aula: o aluno pode repor.`;
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
  const [confirmNoShow, setConfirmNoShow] = useState<TargetComRegra | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<Target | null>(null);
  const [reagendarTarget, setReagendarTarget] = useState<Target | null>(null);
  const [cancelarTarget, setCancelarTarget] = useState<TargetComRegra | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["admin-settings", profile?.id],
    queryFn: () => getAdminSettings(profile!.id),
    enabled: !!profile,
  });
  const noShowConsumesClass = settings?.noShowConsumesClass ?? true;

  /** Lê a regra da aula antes de abrir a janela (é rápido; se falhar, a janela usa um texto neutro). */
  async function comRegra(booking: Booking, studentName: string): Promise<TargetComRegra> {
    try {
      const padrao = profile
        ? ((await queryClient.fetchQuery({ queryKey: ["admin-settings", profile.id], queryFn: () => getAdminSettings(profile.id) }))
            ?.noShowConsumesClass ?? true)
        : noShowConsumesClass;
      const regra = await queryClient.fetchQuery({
        queryKey: ["regra-consumo", booking.id, padrao],
        queryFn: () => getRegraDeConsumo(booking, padrao),
        staleTime: 60_000,
      });
      return { booking, studentName, regra };
    } catch {
      return { booking, studentName, regra: null };
    }
  }

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

  const reagendar = useMutation({
    mutationFn: ({ bookingId, inicio, fim }: { bookingId: string; inicio: string; fim: string }) =>
      reagendarAula(bookingId, inicio, fim),
    onSuccess: () => {
      after();
      setReagendarTarget(null);
      toast.success("Aula remarcada — a original fica registrada como remarcada.");
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível remarcar a aula.")),
  });

  const cancelar = useMutation({
    mutationFn: ({ bookingId, canceladoPor }: { bookingId: string; canceladoPor: "professor" | "aluno" }) =>
      cancelarAula(bookingId, canceladoPor),
    onSuccess: (_r, vars) => {
      after();
      setCancelarTarget(null);
      toast.warning(
        vars.canceladoPor === "professor"
          ? "Aula cancelada — crédito do aluno preservado."
          : "Aula cancelada pelo aluno.",
      );
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível cancelar a aula.")),
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
        description={
          confirmNoShow
            ? `${confirmNoShow.studentName} não veio à aula de ${formatDateTime(confirmNoShow.booking.startTime)}.\n\n${textoFalta(confirmNoShow.regra)}`
            : ""
        }
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

      {reagendarTarget && (
        <RescheduleSheet
          open={!!reagendarTarget}
          onOpenChange={(o) => !o && setReagendarTarget(null)}
          booking={reagendarTarget.booking}
          studentName={reagendarTarget.studentName}
          pending={reagendar.isPending}
          onConfirm={(inicio, fim) => reagendar.mutate({ bookingId: reagendarTarget.booking.id, inicio, fim })}
        />
      )}

      {cancelarTarget && (
        <CancelLessonSheet
          open={!!cancelarTarget}
          onOpenChange={(o) => !o && setCancelarTarget(null)}
          booking={cancelarTarget.booking}
          studentName={cancelarTarget.studentName}
          alunoCancelarConsome={cancelarTarget.regra ? cancelarTarget.regra.cancelamentoPeloAluno : null}
          pending={cancelar.isPending}
          onConfirm={(canceladoPor) => cancelar.mutate({ bookingId: cancelarTarget.booking.id, canceladoPor })}
        />
      )}
    </>
  );

  return {
    isBusy,
    openComplete: (booking: Booking, studentName: string) => setConfirmComplete({ booking, studentName }),
    openNoShow: (booking: Booking, studentName: string) => {
      void comRegra(booking, studentName).then(setConfirmNoShow);
    },
    openReplacement: (booking: Booking, studentName: string) => setReplacementTarget({ booking, studentName }),
    openReagendar: (booking: Booking, studentName: string) => setReagendarTarget({ booking, studentName }),
    openCancelar: (booking: Booking, studentName: string) => {
      void comRegra(booking, studentName).then(setCancelarTarget);
    },
    undo: (bookingId: string) => undo.mutate(bookingId),
    undoPending: undo.isPending,
    dialogs,
  };
}
