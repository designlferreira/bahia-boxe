import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDateTime, formatQuando } from "@/lib/dateUtils";
import type { ReposicaoProposta } from "@/integrations/backend/api";
import type { Booking } from "@/integrations/backend/types";

interface CancelLessonSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  studentName: string;
  /**
   * Se "o aluno cancelou" desconta aula — a regra DESTA aula (`getRegraDeConsumo`), não a
   * configuração geral do professor. Muda só o texto; quem aplica é o banco. null = não deu pra ler.
   */
  alunoCancelarConsome: boolean | null;
  /**
   * Aula de pacote de recorrência: onde a aula nova entraria se o professor cancelar (migration 0039).
   * undefined = aula fora de pacote de recorrência (sem opção); null = não há horário fixo ativo.
   */
  reposicao?: ReposicaoProposta | null;
  pending?: boolean;
  onConfirm: (canceladoPor: "professor" | "aluno", repor: ReposicaoProposta | null) => void;
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
  alunoCancelarConsome,
  reposicao,
  pending,
  onConfirm,
}: CancelLessonSheetProps) {
  // "Repor" começa marcado: o pacote deve seguir com todas as aulas marcadas nos horários fixos.
  const [repor, setRepor] = useState(true);
  const podeRepor = !!reposicao;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>CANCELAR AULA</SheetTitle>
        <div className="text-[13px] text-muted-foreground mb-4">
          {studentName} · {formatDateTime(booking.startTime)}
        </div>

        {reposicao !== undefined && (
          <div className="card-dark p-4 mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div id="repor-titulo" className="text-[14px] font-semibold text-foreground">
                Marcar uma aula nova no fim do pacote
              </div>
              <div id="repor-desc" className="text-[12.5px] text-muted-foreground mt-0.5">
                {podeRepor
                  ? `Vale só se você cancelar. Nova aula: ${formatQuando(reposicao.inicio)}.`
                  : "Não há horário fixo ativo para este aluno, então a aula não pode ser reposta automaticamente."}
              </div>
            </div>
            <Switch
              checked={podeRepor && repor}
              disabled={!podeRepor || pending}
              onCheckedChange={setRepor}
              aria-labelledby="repor-titulo"
              aria-describedby="repor-desc"
            />
          </div>
        )}

        <div className="text-[13px] text-foreground/85 mb-3.5">Quem cancelou?</div>

        <div className="flex flex-col gap-2.5 mb-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("professor", podeRepor && repor ? reposicao : null)}
            className="w-full text-left card-dark p-4 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="text-[15px] font-semibold text-foreground">Eu cancelei</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              O aluno não perde a aula — cancelamento pelo professor nunca desconta.
            </div>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("aluno", null)}
            className="w-full text-left card-dark p-4 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="text-[15px] font-semibold text-foreground">O aluno cancelou</div>
            <div className={`text-[12.5px] mt-0.5 ${alunoCancelarConsome ? "text-amber" : "text-muted-foreground"}`}>
              {alunoCancelarConsome === null
                ? "O que acontece com a aula segue a regra do pacote do aluno."
                : alunoCancelarConsome
                  ? "Desconta 1 aula do aluno, pela regra do pacote."
                  : "Não desconta aula do aluno."}
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
