import { useEffect, useRef, useState } from "react";
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
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const horaOriginal = formatTime(booking.startTime);
  // Começa no primeiro dia em que a hora da aula ainda está no futuro e não é a própria aula:
  // antes abria em "hoje", e passada a hora a janela já nascia com o botão desativado e o aviso
  // "Esse horário já passou".
  const diaInicial =
    dias.find((d) => {
      const i = fromZonedTime(`${d}T${horaOriginal}:00`, TIMEZONE);
      return i.getTime() > Date.now() && i.getTime() !== new Date(booking.startTime).getTime();
    }) ?? dias[0];
  const [dia, setDia] = useState<string>(diaInicial);
  const [hora, setHora] = useState<string>(horaOriginal);
  const hoje = format(toZonedTime(new Date(), TIMEZONE), "yyyy-MM-dd");
  const horaAgora = Number(formatTime(new Date().toISOString()).slice(0, 2));
  const diaRef = useRef<HTMLButtonElement>(null);
  const horaRef = useRef<HTMLButtonElement>(null);

  // O escolhido pode estar fora da vista (28 dias, 24 horas): leva ele pra dentro da faixa.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      diaRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
      horaRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  const duracaoMs = new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime();
  const inicio = fromZonedTime(`${dia}T${hora}:00`, TIMEZONE);
  const fim = new Date(inicio.getTime() + duracaoMs);
  const noPassado = inicio.getTime() <= Date.now();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>REMARCAR AULA</SheetTitle>
        <div className="text-[13px] text-muted-foreground mb-4">
          {studentName} · Atual: {formatDateTime(booking.startTime)}
        </div>

        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Novo dia</div>
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
          {dias.map((d) => (
            <button
              key={d}
              type="button"
              ref={dia === d ? diaRef : undefined}
              onClick={() => setDia(d)}
              aria-pressed={dia === d}
              className={cn(
                `shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${FOCO}`,
                dia === d ? "bg-primary/15 border-primary text-[hsl(var(--red-text))]" : "bg-secondary border-border text-foreground/85",
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
            // Hoje, hora que já passou não serve pra nada — apagada, não escondida (a faixa mantém
            // as 24 posições no lugar de sempre).
            const passou = dia === hoje && h <= horaAgora;
            return (
              <button
                key={v}
                type="button"
                ref={hora === v ? horaRef : undefined}
                disabled={passou}
                onClick={() => setHora(v)}
                aria-pressed={hora === v}
                className={cn(
                  `shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${FOCO}`,
                  hora === v ? "bg-primary/15 border-primary text-[hsl(var(--red-text))]" : "bg-secondary border-border text-foreground/85",
                  passou && "opacity-40",
                )}
              >
                {v}
              </button>
            );
          })}
        </div>

        <div className="rounded-[13px] bg-background border border-border p-3 mb-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Vai ficar</div>
          <div className="text-[14.5px] font-semibold text-foreground">
            {formatDateTime(inicio.toISOString())} – {formatTime(fim.toISOString())}
          </div>
          <div className="text-[13px] text-muted-foreground mt-1">
            A aula original fica registrada como remarcada — ela não é apagada, e o aluno não perde
            uma aula por isso.
          </div>
        </div>

        {noPassado && (
          <div className="text-[13px] text-amber mb-3.5">Esse horário já passou. Escolha um dia ou hora à frente.</div>
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
