import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDateTime } from "@/lib/dateUtils";
import {
  canRefundBooking,
  getAdminBookingHistory,
  markBookingAsMakeup,
  refundBooking,
  undoRefundBooking,
} from "@/integrations/backend/api";
import { CalendarX } from "lucide-react";

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "completed", label: "Concluídas" },
  { value: "no_show", label: "Faltas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "scheduled", label: "Agendadas" },
];

export default function AdminHistorico() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [refundTarget, setRefundTarget] = useState<{ id: string; studentName: string } | null>(null);

  const key = ["admin-history", profile?.id, search, statusFilter];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getAdminBookingHistory(profile!.id, search, statusFilter),
    enabled: !!profile,
  });

  const refund = useMutation({
    mutationFn: (bookingId: string) => refundBooking(bookingId),
    onSuccess: (_r, bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-history"] });
      const studentName = data?.find((x) => x.booking.id === bookingId)?.studentName ?? "";
      toast.warning(`Crédito devolvido para ${studentName.split(" ")[0]}`, {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            await undoRefundBooking(bookingId);
            queryClient.invalidateQueries({ queryKey: ["admin-history"] });
            toast.warning("Reembolso desfeito");
          },
        },
      });
    },
  });

  const makeup = useMutation({
    mutationFn: (bookingId: string) => markBookingAsMakeup(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-history"] });
      toast.success("Aula marcada como reposição");
    },
  });

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-3.5">HISTÓRICO</h1>
      <BookingFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por aluno"
        filters={FILTERS}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      {isError && <ErrorState title="Não foi possível carregar o histórico" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={104} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map(({ booking, studentName }) => {
            const cfg = getStatusConfig(booking.status);
            return (
              <div key={booking.id} className="card-dark p-3.5">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{formatDateTime(booking.startTime)}</div>
                  </div>
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                  {booking.isMakeup && <Badge className="bg-secondary text-muted-foreground">Reposição</Badge>}
                  {booking.refunded && <Badge className="bg-accent/15 text-accent">Reembolsada</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={!canRefundBooking(booking)}
                    onClick={() => setRefundTarget({ id: booking.id, studentName })}
                  >
                    {booking.refunded ? "Reembolsada" : "Reembolsar aula"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={booking.isMakeup}
                    onClick={() => makeup.mutate(booking.id)}
                  >
                    Marcar reposição
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState icon={CalendarX} title="Nenhuma aula nesse filtro" description="Ajuste a busca ou o status." />
      )}

      <ConfirmDialog
        open={!!refundTarget}
        onOpenChange={(o) => !o && setRefundTarget(null)}
        title="REEMBOLSAR AULA"
        description={`O crédito desta aula será devolvido ao pacote de ${refundTarget?.studentName}. Essa ação pode ser desfeita logo em seguida, pelo toast.`}
        confirmLabel="Reembolsar"
        onConfirm={() => refundTarget && refund.mutate(refundTarget.id)}
      />
    </div>
  );
}
