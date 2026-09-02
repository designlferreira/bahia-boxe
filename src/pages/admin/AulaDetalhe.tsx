import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig, isAwaitingConfirmation } from "@/lib/bookingStatus";
import { formatDate, formatTime } from "@/lib/dateUtils";
import { useLessonActions } from "@/hooks/useLessonActions";
import { getAdminBookingDetail } from "@/integrations/backend/api";

export default function AdminAulaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: detail, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-booking", id],
    queryFn: () => getAdminBookingDetail(id!),
    enabled: !!id,
  });
  const booking = detail?.booking;
  const studentName = detail?.studentName ?? "Aluno";

  const actions = useLessonActions(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-booking", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
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

  const cfg = getStatusConfig(booking.status);
  const awaiting = booking.status === "scheduled" && isAwaitingConfirmation(booking.status, booking.endTime);
  const initials = studentName.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="page-container">
      <PageHeader title="DETALHE DA AULA" back />

      <div className="card-dark p-5 mb-3.5">
        <div className="flex items-center gap-2 mb-3">
          <Badge className={awaiting ? "bg-amber/20 text-amber" : cfg.badgeClass}>
            {awaiting ? "Aguardando confirmação" : cfg.label}
          </Badge>
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
        <button
          type="button"
          onClick={() => navigate(`/admin/alunos/${booking.studentId}`)}
          className="flex items-center gap-2.5 -m-1 p-1 rounded-xl active:scale-[0.98] transition-transform"
        >
          <Avatar initials={initials} size="sm" />
          <div className="text-left">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aluno</div>
            <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
          </div>
        </button>
      </div>

      {booking.teacherNote && (
        <div className="rounded-2xl p-4 bg-amber/[0.08] border border-amber/25 mb-3.5">
          <div className="text-[11.5px] uppercase tracking-wide text-amber/80 font-semibold mb-1.5">Sua observação</div>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{booking.teacherNote}</div>
        </div>
      )}

      {booking.status === "scheduled" && (
        <div className="flex flex-col gap-2.5">
          {awaiting && (
            <div className="flex gap-2.5">
              <Button
                size="lg"
                className="flex-1 !bg-accent/10 !text-accent !border !border-accent/40 !shadow-none"
                disabled={actions.isBusy(booking.id)}
                onClick={() => actions.openComplete(booking, studentName)}
              >
                Concluir
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={actions.isBusy(booking.id)}
                onClick={() => actions.openNoShow(booking, studentName)}
              >
                Falta
              </Button>
            </div>
          )}
          {!booking.isReplacement && (
            <Button variant="secondary" size="lg" onClick={() => actions.openReplacement(booking, studentName)}>
              Marcar como reposição
            </Button>
          )}
        </div>
      )}

      {actions.dialogs}
    </div>
  );
}
