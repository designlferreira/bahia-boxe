import { useEffect, useState } from "react";
import { addDays } from "date-fns";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAvailableSlotsForDay } from "@/integrations/backend/api";
import { formatWeekdayShort } from "@/lib/dateUtils";

interface SuggestOption {
  label: string;
  date: Date;
  time: string;
}

interface RejectBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string;
  studentName: string;
  timeLabel: string;
  onConfirm: (note: string, suggestedStart: Date | null, suggestedEnd: Date | null) => void;
  /**
   * Pedido de remarcação do aluno (0033): não cabe sugerir outro horário — a aula original
   * continua valendo e o aluno pode pedir outro. Sem esta flag a tela oferecia a sugestão, a API a
   * ignorava e o aviso dizia "Recusado com sugestão de horário", o que era falso.
   */
  remarcacao?: boolean;
  /** Horário da aula original, pra dizer qual aula continua valendo. */
  originalLabel?: string | null;
}

/** Recusa com teacher_note + horário sugerido opcional. */
export function RejectBookingModal({
  open,
  onOpenChange,
  adminId,
  studentName,
  timeLabel,
  onConfirm,
  remarcacao = false,
  originalLabel,
}: RejectBookingModalProps) {
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<SuggestOption | null>(null);
  const [options, setOptions] = useState<SuggestOption[] | null>(null);

  useEffect(() => {
    if (!open) {
      setNote("");
      setSelected(null);
      setOptions(null);
      return;
    }
    if (remarcacao) return;
    let cancelled = false;
    (async () => {
      const found: SuggestOption[] = [];
      for (let i = 1; i <= 7 && found.length < 3; i++) {
        const day = addDays(new Date(), i);
        const slots = await getAvailableSlotsForDay(adminId, day);
        const free = slots.find((s) => s.status === "free");
        if (free) found.push({ label: `${formatWeekdayShort(day)} ${free.time}`, date: day, time: free.time });
      }
      if (!cancelled) setOptions(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, adminId, remarcacao]);

  function handleConfirm() {
    if (!selected) {
      onConfirm(note, null, null);
      return;
    }
    const [h] = selected.time.split(":").map(Number);
    const start = new Date(selected.date);
    start.setHours(h, 0, 0, 0);
    const end = new Date(start);
    end.setHours(h + 1);
    onConfirm(note, start, end);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>{remarcacao ? "RECUSAR REMARCAÇÃO" : "RECUSAR AGENDAMENTO"}</SheetTitle>
        <div className="text-sm text-muted-foreground mb-3.5">
          {studentName} · {remarcacao ? `pediu ${timeLabel}` : timeLabel}
          {remarcacao && (
            <div className="mt-1">
              {originalLabel ? `A aula de ${originalLabel} continua valendo.` : "A aula original continua valendo."} O aluno
              pode pedir outro horário.
            </div>
          )}
        </div>
        <Textarea maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação para o aluno (opcional)"
          className="h-[82px] mb-3.5"
        />
        {!remarcacao && (
          <>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
          Sugerir outro horário
        </div>
        <div className="flex gap-2 mb-4">
          {!options && (
            <>
              <div className="flex-1 h-11 rounded-xl bg-secondary animate-pulse" />
              <div className="flex-1 h-11 rounded-xl bg-secondary animate-pulse" />
              <div className="flex-1 h-11 rounded-xl bg-secondary animate-pulse" />
            </>
          )}
          {options?.length === 0 && (
            <div className="text-xs text-muted-foreground py-2.5">Sem horários livres nos próximos dias.</div>
          )}
          {options?.map((o) => {
            const on = selected?.label === o.label;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => setSelected(on ? null : o)}
                className={cn(
                  "flex-1 h-11 rounded-xl border text-[13.5px] font-semibold transition-all active:scale-95",
                  on ? "bg-amber/15 border-amber text-amber" : "bg-secondary border-border text-foreground",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
          </>
        )}
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button size="lg" className="flex-[1.4]" onClick={handleConfirm}>
            {selected ? "Recusar e sugerir" : "Recusar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
