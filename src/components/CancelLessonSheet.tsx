import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dateUtils";
import type { Booking } from "@/integrations/backend/types";

interface CancelLessonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  studentName: string;
  /** Config do professor — muda só o texto, a regra quem aplica é `calcular_saldo_pacote`. */
  noShowConsumesClass: boolean;
  pending?: boolean;
  onConfirm: (canceladoPor: "professor" | "aluno") => void;
}

/**
 * Cancelar exige escolher o MOTIVO, porque o motivo muda o crédito (CLAUDE.md, regra única):
 * cancelada pelo professor NUNCA consome; cancelada pelo aluno consome se o pacote cobra falta.
 * Por isso não é um ConfirmDialog de um botão só — a escolha é a ação.
 *
 * `'regeneracao'` (o terceiro valor da coluna) não aparece aqui de propósito: é interno da
 * regeneração de pacote, e a RPC `cancelar_aula` rejeita se vier da tela.
 */
export function CancelLessonSheet({
  open,
  onOpenChange,
  booking,
  studentName,
  noShowConsumesClass,
  pending,
  onConfirm,
}: CancelLessonSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>CANCELAR AULA</SheetTitle>
        <div className="text-[13px] text-muted-foreground mb-4">
          {studentName} · {formatDateTime(booking.startTime)}
        </div>

        <div className="text-[13px] text-foreground/85 mb-3.5">Quem cancelou?</div>

        <div className="flex flex-col gap-2.5 mb-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("professor")}
            className="w-full text-left card-dark p-4 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="text-[15px] font-semibold text-foreground">Eu cancelei</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              O crédito do aluno é preservado — cancelamento pelo professor nunca consome aula.
            </div>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("aluno")}
            className="w-full text-left card-dark p-4 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="text-[15px] font-semibold text-foreground">O aluno cancelou</div>
            <div className={`text-[12.5px] mt-0.5 ${noShowConsumesClass ? "text-amber" : "text-muted-foreground"}`}>
              {noShowConsumesClass
                ? "Pela configuração atual, o crédito desta aula será consumido."
                : "Pela configuração atual, o crédito desta aula será preservado."}
            </div>
          </button>
        </div>

        <Button variant="secondary" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
          Voltar
        </Button>
      </SheetContent>
    </Sheet>
  );
}
