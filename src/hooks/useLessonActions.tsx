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
import { mensagemDeErro } from "@/lib/erros";

const UNDO_TOAST_MS = 9000;

function errorMessage(err: unknown, fallback: string) {
  return mensagemDeErro(err, fallback);
}

interface Target {
  booking: Booking;
  studentName: string;
}

interface AcaoAula {
  id: string;
  studentName: string;
  /** Falta: se desconta aula (null = não se sabe) — só muda o texto do aviso. */
  desconta?: boolean | null;
}

const primeiroNome = (nome: string) => nome.split(" ")[0];

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
  /** Aula cuja regra de falta está sendo lida (trava o botão nesse meio-tempo). */
  const [lendoRegra, setLendoRegra] = useState<string | null>(null);
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

  const [confirmVarias, setConfirmVarias] = useState<Target[] | null>(null);

  /**
   * "Todas aconteceram" (pedido do Lucas, 2026-09-28): registra várias aulas de uma vez, com um só
   * "Desfazer". Uma por vez, não em paralelo — várias podem ser do mesmo pacote, e cada RPC trava a
   * linha do pacote. Se alguma falhar, as outras continuam e o aviso diz qual falhou.
   */
  const completeVarias = useMutation({
    mutationFn: async (alvos: Target[]) => {
      const feitas: Target[] = [];
      const falhas: { alvo: Target; erro: string }[] = [];
      for (const alvo of alvos) {
        try {
          await completeBooking(alvo.booking.id);
          feitas.push(alvo);
        } catch (err) {
          falhas.push({ alvo, erro: errorMessage(err, "erro desconhecido") });
        }
      }
      return { feitas, falhas };
    },
    onSuccess: ({ feitas, falhas }) => {
      after();
      if (feitas.length) {
        toast.success(feitas.length === 1 ? "1 aula registrada" : `${feitas.length} aulas registradas`, {
          duration: UNDO_TOAST_MS,
          action: {
            label: "Desfazer",
            onClick: async () => {
              for (const alvo of feitas) {
                try {
                  await undoLessonAction(alvo.booking.id);
                } catch {
                  /* segue desfazendo as outras; o aviso abaixo cobre */
                }
              }
              after();
              toast("Desfeito");
            },
          },
        });
      }
      for (const { alvo, erro } of falhas) {
        toast.error(`Aula de ${primeiroNome(alvo.studentName)} não foi registrada: ${erro}`);
      }
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível registrar as aulas.")),
  });

  // "Aconteceu" registra direto, sem janela (decisão do Lucas, 2026-09-28): é reversível pelo
  // "Desfazer" do aviso e pelo botão permanente no detalhe da aula — a janela só atrasava.
  const complete = useMutation({
    mutationFn: ({ id }: AcaoAula) => completeBooking(id),
    onSuccess: (_r, { id, studentName }) => {
      after();
      toast.success(`Aula de ${primeiroNome(studentName)} registrada`, {
        duration: UNDO_TOAST_MS,
        action: { label: "Desfazer", onClick: () => undo.mutate(id) },
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível registrar a aula.")),
  });

  const noShow = useMutation({
    mutationFn: ({ id }: AcaoAula) => markNoShow(id),
    onSuccess: (_r, { id, studentName, desconta }) => {
      after();
      toast.warning(`Falta de ${primeiroNome(studentName)} registrada${desconta === false ? " · não desconta aula" : ""}`, {
        duration: UNDO_TOAST_MS,
        action: { label: "Desfazer", onClick: () => undo.mutate(id) },
      });
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível registrar a falta.")),
  });

  /**
   * Faltou: só pede confirmação quando a falta DESCONTA aula (ou quando não deu pra ler a regra) —
   * é o caso em que o professor precisa saber a consequência antes. Sem desconto, registra direto.
   */
  async function pedirFalta(booking: Booking, studentName: string) {
    setLendoRegra(booking.id);
    const alvo = await comRegra(booking, studentName);
    setLendoRegra(null);
    if (alvo.regra && !alvo.regra.falta) noShow.mutate({ id: booking.id, studentName, desconta: false });
    else setConfirmNoShow(alvo);
  }

  const replacement = useMutation({
    mutationFn: ({ bookingId, replacesBookingId }: { bookingId: string; replacesBookingId: string }) =>
      markAsReplacement(bookingId, replacesBookingId),
    onSuccess: () => {
      after();
      setReplacementTarget(null);
      toast.success("Marcada como reposição — não desconta outra aula");
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
          ? "Aula cancelada — o aluno não perde a aula."
          : "Aula cancelada pelo aluno.",
      );
    },
    onError: (err) => toast.error(errorMessage(err, "Não foi possível cancelar a aula.")),
  });

  function isBusy(bookingId: string) {
    return (
      lendoRegra === bookingId ||
      (complete.isPending && complete.variables?.id === bookingId) ||
      (noShow.isPending && noShow.variables?.id === bookingId) ||
      (undo.isPending && undo.variables === bookingId) ||
      (completeVarias.isPending && !!completeVarias.variables?.some((t) => t.booking.id === bookingId))
    );
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!confirmVarias}
        onOpenChange={(o) => !o && setConfirmVarias(null)}
        title={`REGISTRAR ${confirmVarias?.length ?? 0} AULAS?`}
        description={confirmVarias ? `Todas aconteceram:\n${confirmVarias.map((t) => `• ${t.studentName}, ${formatDateTime(t.booking.startTime)}`).join("\n")}\n\nDá pra desfazer logo depois, no aviso.` : ""}
        confirmLabel="Registrar todas"
        cancelLabel="Cancelar"
        tone="default"
        onConfirm={() => {
          if (confirmVarias) completeVarias.mutate(confirmVarias);
          setConfirmVarias(null);
        }}
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
        onConfirm={() =>
          confirmNoShow &&
          noShow.mutate({
            id: confirmNoShow.booking.id,
            studentName: confirmNoShow.studentName,
            desconta: confirmNoShow.regra?.falta ?? null,
          })
        }
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
    /** Registra direto (sem janela), com "Desfazer" no aviso. */
    openComplete: (booking: Booking, studentName: string) => complete.mutate({ id: booking.id, studentName }),
    /** Várias de uma vez: confirma (mostra quais), registra todas, um só "Desfazer". */
    openCompleteVarias: (alvos: Target[]) => setConfirmVarias(alvos),
    variasPending: completeVarias.isPending,
    openNoShow: (booking: Booking, studentName: string) => {
      void pedirFalta(booking, studentName);
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
