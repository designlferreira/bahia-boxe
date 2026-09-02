import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, Clock3, MapPin, Repeat } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDateTime, formatTime, formatDate } from "@/lib/dateUtils";
import { arrivalMessage, equipmentItems, formatAddress, hasAddress, mapsUrl } from "@/lib/classGuidelines";
import { acceptSuggestion, cancelBooking, getBookingDetail, getClassGuidelinesForBooking } from "@/integrations/backend/api";

export default function StudentAulaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: detail, isLoading, isError, refetch } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => getBookingDetail(id!),
    enabled: !!id,
  });
  const booking = detail?.booking;
  // `profiles` is not readable by a student, so the professor's name only exists when the
  // history view could resolve it.
  const professor = detail?.adminName ?? "Seu professor";

  const { data: guidelines } = useQuery({
    queryKey: ["class-guidelines", booking?.adminId],
    queryFn: () => getClassGuidelinesForBooking(booking!),
    enabled: !!booking,
  });

  const cancel = useMutation({
    mutationFn: () => cancelBooking(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      toast.warning("Aula cancelada · crédito devolvido");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível cancelar a aula."),
  });

  const accept = useMutation({
    mutationFn: () => acceptSuggestion(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      navigate("/app/home");
      toast.success(`Horário confirmado para ${formatDateTime(booking!.suggestedStartTime!)}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível aceitar o novo horário."),
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="DETALHE DA AULA" back />
        <SkeletonCard height={220} />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="page-container">
        <PageHeader title="DETALHE DA AULA" back />
        <ErrorState title="Não foi possível carregar a aula" onRetry={() => refetch()} />
      </div>
    );
  }

  if (booking.status === "rejected_with_suggestion" && booking.suggestedStartTime && booking.suggestedEndTime) {
    return (
      <div className="page-container">
        <PageHeader title="SUGESTÃO DE HORÁRIO" back />

        <div className="rounded-[20px] p-[18px] bg-card border border-border mb-3 opacity-70">
          <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Horário recusado
          </div>
          <div className="text-[17px] text-muted-foreground line-through">{formatDateTime(booking.startTime)}</div>
        </div>

        <div className="flex justify-center my-1 mb-3">
          <ArrowDown className="h-[22px] w-[22px] text-amber" />
        </div>

        <div className="rounded-[20px] p-5 bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-amber/35 mb-4">
          <div className="text-[11.5px] uppercase tracking-wide text-amber/80 font-semibold mb-2">
            Novo horário proposto
          </div>
          <div className="font-display text-4xl tracking-wide text-foreground leading-none">
            {formatDate(booking.suggestedStartTime).toUpperCase()}
          </div>
          <div className="text-base text-accent mt-0.5">
            {formatTime(booking.suggestedStartTime)} – {formatTime(booking.suggestedEndTime)}
          </div>
          {booking.teacherNote && (
            <>
              <div className="h-px bg-[#2E2A1A] my-3.5" />
              <div className="text-[13.5px] text-foreground/85 leading-relaxed">“{booking.teacherNote}”</div>
              <div className="text-xs text-muted-foreground mt-2">— {professor}</div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <Button size="lg" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? "Confirmando…" : "Aceitar novo horário"}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate("/app/agendar")}>
            Escolher outro horário
          </Button>
        </div>
      </div>
    );
  }

  const cfg = getStatusConfig(booking.status);
  const cancelable = (booking.status === "scheduled" || booking.status === "pending_confirmation") &&
    new Date(booking.startTime).getTime() > Date.now();
  const arrival = guidelines ? arrivalMessage(guidelines.arrivalMinutes) : null;
  const equipment = guidelines ? equipmentItems(guidelines.equipment) : [];
  const address = guidelines && hasAddress(guidelines) ? formatAddress(guidelines) : null;

  return (
    <div className="page-container">
      <PageHeader title="DETALHE DA AULA" back />

      <div className="card-dark p-5 mb-3.5">
        <div className="flex items-center gap-2 mb-3">
          <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
          {booking.isReplacement && (
            <Badge className="bg-secondary text-muted-foreground flex items-center gap-1">
              <Repeat className="h-3 w-3" /> Reposição
            </Badge>
          )}
        </div>
        <div className="font-display text-[38px] tracking-wide text-foreground leading-none">
          {formatDate(booking.startTime)}
        </div>
        <div className="text-[15px] text-muted-foreground mt-0.5">
          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
        </div>
        <div className="h-px bg-border my-4" />
        <div className="flex items-center gap-2.5">
          <Avatar initials={professor.split(" ").map((n) => n[0]).slice(0, 2).join("")} size="sm" />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Professor</div>
            <div className="text-[14.5px] font-semibold text-foreground">{professor}</div>
          </div>
        </div>
      </div>

      {address && (
        <div className="card-dark p-4 mb-3.5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
            <MapPin className="h-3.5 w-3.5" /> Onde será
          </div>
          <div className="text-[14.5px] text-foreground/90 leading-snug">{address}</div>
          {guidelines?.referencePoint && (
            <div className="text-[12.5px] text-muted-foreground mt-1">Referência: {guidelines.referencePoint}</div>
          )}
          <a
            href={mapsUrl(guidelines!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center mt-2 text-[13px] font-semibold text-accent"
          >
            Ver no mapa
          </a>
        </div>
      )}

      {arrival && (
        <div className="flex items-start gap-2.5 rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <Clock3 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{arrival}</div>
        </div>
      )}

      {equipment.length > 0 && (
        <div className="mb-3.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Leve para esta aula</div>
          <div className="flex flex-wrap gap-2">
            {equipment.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-secondary px-3 py-2">
                <div className="text-[13px] font-semibold text-foreground">{item.label}</div>
                {item.sub && <div className="text-[11px] text-muted-foreground">{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {guidelines?.notes && (
        <div className="rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Orientações</div>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{guidelines.notes}</div>
        </div>
      )}

      {booking.teacherNote && booking.status !== "rejected" && (
        <div className="rounded-2xl p-4 bg-amber/[0.08] border border-amber/25 mb-3.5">
          <div className="text-[11.5px] uppercase tracking-wide text-amber/80 font-semibold mb-1.5">
            Observação do professor
          </div>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{booking.teacherNote}</div>
        </div>
      )}

      {cancelable && (
        <Button variant="destructive" size="lg" className="w-full" onClick={() => setConfirmCancel(true)}>
          Cancelar aula
        </Button>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="CANCELAR AULA"
        description={`A aula de ${formatDate(booking.startTime)} será cancelada e o crédito volta para o seu pacote.`}
        confirmLabel="Cancelar aula"
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
