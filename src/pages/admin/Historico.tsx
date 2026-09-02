import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDateTime } from "@/lib/dateUtils";
import { getAdminBookingHistory } from "@/integrations/backend/api";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");

  const key = ["admin-history", profile?.id, search, statusFilter];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getAdminBookingHistory(profile!.id, search, statusFilter),
    enabled: !!profile,
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
                <div className="flex items-center gap-2.5">
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{formatDateTime(booking.startTime)}</div>
                  </div>
                  {booking.isReplacement && <Badge className="bg-secondary text-muted-foreground">Reposição</Badge>}
                  <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState icon={CalendarX} title="Nenhuma aula nesse filtro" description="Ajuste a busca ou o status." />
      )}

    </div>
  );
}
