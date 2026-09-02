import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/dateUtils";
import { getStatusConfig } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";
import { getReplaceableBookingsForStudent } from "@/integrations/backend/api";
import { CalendarSearch } from "lucide-react";

interface ReplacementPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  onPick: (bookingId: string) => void;
}

/** Escolher qual aula perdida esta aula está recuperando — nunca um "+1" solto. */
export function ReplacementPickerSheet({ open, onOpenChange, studentId, studentName, onPick }: ReplacementPickerSheetProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["replaceable-bookings", studentId],
    queryFn: () => getReplaceableBookingsForStudent(studentId),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>QUAL AULA ESTÁ SENDO REPOSTA?</SheetTitle>
        <div className="text-[13px] text-muted-foreground mb-4">Aulas de {studentName} que não aconteceram</div>

        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-secondary animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && data?.length === 0 && (
          <EmptyState
            icon={CalendarSearch}
            title="Nenhuma aula elegível"
            description="Esse aluno não tem faltas ou cancelamentos recentes para vincular."
          />
        )}

        {!isLoading && data && data.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.map((b) => {
              const cfg = getStatusConfig(b.status);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPick(b.id)}
                  className="w-full text-left card-dark p-3.5 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
                >
                  <span className="text-[13.5px] text-foreground/90">{formatDateTime(b.startTime)}</span>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
