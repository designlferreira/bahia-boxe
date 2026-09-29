import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { formatDateTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { getAdminBookingHistoryPage } from "@/integrations/backend/api";
import { CalendarX } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "sem_registro", label: "Sem registro" },
  { value: "completed", label: "Concluídas" },
  { value: "no_show", label: "Faltas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "scheduled", label: "Agendadas" },
];

export default function AdminHistorico() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");

  // A consulta só sai ~0,3 s depois da última tecla (antes cada tecla refazia a busca).
  const [buscaAplicada, setBuscaAplicada] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const key = ["admin-history", profile?.id, buscaAplicada, statusFilter];
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => getAdminBookingHistoryPage(profile!.id, buscaAplicada, statusFilter, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => (ultima.hasMore ? todas.length : undefined),
    enabled: !!profile,
  });
  const aulas = data?.pages.flatMap((p) => p.items) ?? [];

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

      {!isLoading && !isError && data && aulas.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {aulas.map(({ booking, studentName }) => {
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => navigate(`/admin/aula/${booking.id}`)}
                className="w-full text-left card-dark p-3.5 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex-1">
                    <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{formatDateTime(booking.startTime)}</div>
                  </div>
                  {booking.isReplacement && <Badge className="bg-secondary text-muted-foreground">Reposição</Badge>}
                  <StatusBadge
                    status={booking.status}
                    semRegistro={isAwaitingConfirmation(booking.status, booking.endTime)}
                    agora={booking.status === "scheduled" && new Date(booking.startTime).getTime() <= Date.now() && new Date(booking.endTime).getTime() > Date.now()}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && data && aulas.length > 0 && (
        <div className="mt-4 text-center">
          <div className="text-[12.5px] text-muted-foreground mb-2.5" aria-live="polite">
            {hasNextPage ? `Mostrando as ${aulas.length} mais recentes` : aulas.length === 1 ? "1 aula no total" : `${aulas.length} aulas no total`}
          </div>
          {hasNextPage && (
            <Button variant="secondary" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Carregando…" : "Ver mais aulas"}
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && data && aulas.length === 0 && (
        <EmptyState icon={CalendarX} title="Nenhuma aula nesse filtro" description="Ajuste a busca ou o status." />
      )}

    </div>
  );
}
