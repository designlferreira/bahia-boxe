import { useState } from "react";
import { addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateShort, formatDateTime, formatTime, formatWeekdayShort, TIMEZONE } from "@/lib/dateUtils";
import type { Booking } from "@/integrations/backend/types";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hhmm = (h: number) => String(h).padStart(2, "0") + ":00";
const DIAS_A_FRENTE = 28;

/** Próximos `DIAS_A_FRENTE` dias em BRT, como "yyyy-MM-dd" — inclui hoje. */
function proximosDias(): string[] {
  const out: string[] = [];
  let d = toZonedTime(new Date(), TIMEZONE);
  for (let i = 0; i < DIAS_A_FRENTE; i++) {
    out.push(format(d, "yyyy-MM-dd"));
    d = addDays(d, 1);
  }
  return out;
}

function labelDia(dateOnly: string): string {
  const iso = fromZonedTime(`${dateOnly}T12:00:00`, TIMEZONE).toISOString();
  return `${formatWeekdayShort(iso)}, ${formatDateShort(iso)}`;
}

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking;
  studentName: string;
  pending?: boolean;
  onConfirm: (novoInicioIso: string, novoFimIso: string) => void;
}

/**
 * Escolhe o novo horário de uma aula. A DURAÇÃO é preservada da aula original — remarcar move a
 * aula, não a encurta nem estende; por isso só se escolhe dia e hora de início.
 *
 * Mesma linguagem de chips do resto do app (disponibilidade, dias fixos da recorrência), sem
 * introduzir um calendário em grade que não existe em lugar nenhum aqui.
 */
export function RescheduleSheet({ open, onOpenChange, booking, studentName, pending, onConfirm }: RescheduleSheetProps) {
  const dias = proximosDias();
  const [dia, setDia] = useState<string>(dias[0]);
  const [hora, setHora] = useState<string>(formatTime(booking.startTime));

  const duracaoMs = new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime();
  const inicio = fromZonedTime(`${dia}T${hora}:00`, TIMEZONE);
  const fim = new Date(inicio.getTime() + duracaoMs);
  const noPassado = inicio.getTime() <= Date.now();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>REMARCAR AULA</SheetTitle>
        <div className="text-[13px] text-muted-foreground mb-4">
          {studentName} · hoje em {formatDateTime(booking.startTime)}
        </div>

        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Novo dia</div>
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
          {dias.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDia(d)}
              className={cn(
                "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                dia === d ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
              )}
            >
              {labelDia(d)}
            </button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Novo horário</div>
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
          {HOURS.map((h) => {
            const v = hhmm(h);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setHora(v)}
                className={cn(
                  "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                  hora === v ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>

        <div className="rounded-[13px] bg-[#141414] border border-[#262626] p-3 mb-4">
          <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground mb-1">Vai ficar</div>
          <div className="text-[14.5px] font-semibold text-foreground">
            {formatDateTime(inicio.toISOString())} – {formatTime(fim.toISOString())}
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            A aula original fica registrada como remarcada — ela não é apagada, e o crédito não é
            cobrado duas vezes.
          </div>
        </div>

        {noPassado && (
          <div className="text-[12px] text-amber mb-3.5">Esse horário já passou. Escolha um dia ou hora à frente.</div>
        )}

        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            size="lg"
            className="flex-[1.4]"
            disabled={noPassado || pending}
            onClick={() => onConfirm(inicio.toISOString(), fim.toISOString())}
          >
            Remarcar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
