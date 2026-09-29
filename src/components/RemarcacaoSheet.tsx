import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/SkeletonCard";
import { cn } from "@/lib/utils";
import { TIMEZONE, formatDate, formatDateShort, formatDayNumber, formatTime, formatWeekdayShort } from "@/lib/dateUtils";
import { getHorariosLivresRemarcacao, pedirRemarcacao } from "@/integrations/backend/api";

/** Quantos dias à frente o aluno pode escolher. */
const DIAS = 21;

interface RemarcacaoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  onDone: () => void;
  onError: (err: unknown) => void;
}

/**
 * O aluno de recorrência escolhe um novo horário pra uma aula (0033): um dia, depois uma hora cheia
 * livre do professor (06h–22h, >= 24h de antecedência — quem calcula é o banco, que vê a agenda
 * inteira; o aluno só recebe as horas vagas). O pedido fica "Aguardando o professor".
 */
export function RemarcacaoSheet({ open, onOpenChange, bookingId, onDone, onError }: RemarcacaoSheetProps) {
  // Dias no calendário de São Paulo, a partir de amanhã (hoje nunca tem 24h de antecedência).
  const dias = Array.from({ length: DIAS }, (_, i) => addDays(new Date(), i + 1));
  const [dia, setDia] = useState(() => dias[0]);
  const [hora, setHora] = useState<string | null>(null);
  const diaKey = formatInTimeZone(dia, TIMEZONE, "yyyy-MM-dd");

  const { data: horas, isLoading, isError, refetch } = useQuery({
    queryKey: ["horarios-livres-remarcacao", bookingId, diaKey],
    queryFn: () => getHorariosLivresRemarcacao(bookingId, diaKey),
    enabled: open,
  });

  const pedir = useMutation({
    mutationFn: (inicio: string) => pedirRemarcacao(bookingId, inicio),
    onSuccess: () => {
      setHora(null);
      onDone();
    },
    onError,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>PEDIR OUTRO HORÁRIO</SheetTitle>
        <div className="text-sm text-muted-foreground mb-4">
          Seu professor precisa aprovar. Até lá, sua aula continua no horário atual.
        </div>

        <div className="text-sm font-semibold text-foreground mb-2">Dia</div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scroll-fade-x">
          {dias.map((d) => {
            const key = formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
            const active = key === diaKey;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                aria-label={formatDate(d)}
                onClick={() => {
                  setDia(d);
                  setHora(null);
                }}
                className={cn(
                  "shrink-0 w-14 h-16 rounded-xl flex flex-col items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-foreground text-background border-foreground" : "bg-secondary border-border text-foreground",
                )}
              >
                <span className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>
                  {formatWeekdayShort(d)}
                </span>
                <span className="text-lg font-semibold leading-tight">{formatDayNumber(d)}</span>
              </button>
            );
          })}
        </div>

        <div className="text-sm font-semibold text-foreground mt-4 mb-2">Horário livre</div>
        {isLoading && <SkeletonCard height={96} />}
        {isError && (
          <div className="text-sm text-muted-foreground">
            Não foi possível carregar os horários.{" "}
            <button type="button" onClick={() => refetch()} className="min-h-11 font-semibold text-foreground underline underline-offset-4">
              Tentar de novo
            </button>
          </div>
        )}
        {!isLoading && !isError && horas && horas.length === 0 && (
          <div className="text-sm text-muted-foreground rounded-xl border border-dashed border-border p-4 text-center">
            Nenhum horário livre neste dia. Tente outro.
          </div>
        )}
        {!isLoading && horas && horas.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {horas.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={hora === h}
                onClick={() => setHora(h)}
                className={cn(
                  "h-11 rounded-xl border text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  hora === h ? "bg-foreground text-background border-foreground" : "bg-secondary border-border text-foreground",
                )}
              >
                {formatTime(h)}
              </button>
            ))}
          </div>
        )}

        <Button
          size="lg"
          className="w-full mt-5"
          disabled={!hora || pedir.isPending}
          onClick={() => hora && pedir.mutate(hora)}
        >
          {pedir.isPending
            ? "Enviando…"
            : hora
              ? `Pedir ${formatDateShort(hora)} · ${formatTime(hora)}`
              : "Escolha um horário"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
