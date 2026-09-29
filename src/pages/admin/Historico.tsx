import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { TIMEZONE, formatTime, formatWeekdayLong } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { getAdminBookingHistoryPage } from "@/integrations/backend/api";
import { CalendarX } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Periodo = "proximas" | "anteriores";

/** Cada parte tem os filtros que fazem sentido nela ("Sem registro" só existe entre as anteriores). */
const FILTROS: Record<Periodo, { value: string; label: string }[]> = {
  proximas: [
    { value: "todas", label: "Todas" },
    { value: "scheduled", label: "Agendadas" },
    { value: "pending_confirmation", label: "Pendentes" },
  ],
  anteriores: [
    { value: "todas", label: "Todas" },
    { value: "sem_registro", label: "Sem registro" },
    { value: "completed", label: "Concluídas" },
    { value: "no_show", label: "Faltas" },
    { value: "cancelled", label: "Canceladas" },
    { value: "rescheduled", label: "Remarcadas" },
  ],
};

const diaChave = (iso: string) => formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd");

/** "Hoje" / "Amanhã" / "Ontem" / "Quinta-feira, 01 out" (com o ano quando não é o atual). */
function tituloDoDia(iso: string): string {
  const agora = Date.now();
  const alvo = diaChave(iso);
  if (alvo === diaChave(new Date(agora).toISOString())) return "Hoje";
  if (alvo === diaChave(new Date(agora + 86_400_000).toISOString())) return "Amanhã";
  if (alvo === diaChave(new Date(agora - 86_400_000).toISOString())) return "Ontem";
  const mesmoAno = formatInTimeZone(iso, TIMEZONE, "yyyy") === formatInTimeZone(new Date(agora), TIMEZONE, "yyyy");
  return `${formatWeekdayLong(iso)}, ${formatInTimeZone(iso, TIMEZONE, mesmoAno ? "dd MMM" : "dd MMM yyyy", { locale: ptBR })}`;
}

export default function AdminHistorico() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("anteriores");
  const [statusFilter, setStatusFilter] = useState("todas");

  // A consulta só sai ~0,3 s depois da última tecla (antes cada tecla refazia a busca).
  const [buscaAplicada, setBuscaAplicada] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  function trocarPeriodo(p: Periodo) {
    setPeriodo(p);
    setStatusFilter("todas"); // os filtros mudam de uma parte para a outra
  }

  const key = ["admin-history", profile?.id, buscaAplicada, statusFilter, periodo];
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => getAdminBookingHistoryPage(profile!.id, buscaAplicada, statusFilter, periodo, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => (ultima.hasMore ? todas.length : undefined),
    enabled: !!profile,
  });
  const aulas = data?.pages.flatMap((p) => p.items) ?? [];

  // Agrupa por dia (a lista já vem na ordem certa de cada parte).
  const dias: { chave: string; titulo: string; itens: typeof aulas }[] = [];
  for (const a of aulas) {
    const chave = diaChave(a.booking.startTime);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(a);
    else dias.push({ chave, titulo: tituloDoDia(a.booking.startTime), itens: [a] });
  }

  return (
    <div className="page-container">
      <PageHeader title="AULAS" />

      <div role="group" aria-label="Período" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-secondary mb-3.5">
        {(["anteriores", "proximas"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={periodo === p}
            onClick={() => trocarPeriodo(p)}
            className={cn(
              "h-11 rounded-[10px] text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              periodo === p ? "bg-card text-foreground" : "text-muted-foreground",
            )}
          >
            {p === "anteriores" ? "Anteriores" : "Próximas"}
          </button>
        ))}
      </div>

      <BookingFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por aluno"
        filters={FILTROS[periodo]}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      {isError && <ErrorState title="Não foi possível carregar as aulas" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={72} />}

      {!isLoading && !isError && data && dias.length > 0 && (
        <div>
          {dias.map((dia) => (
            <section key={dia.chave} aria-labelledby={`dia-${dia.chave}`} className="mb-4">
              <h2 id={`dia-${dia.chave}`} className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                {dia.titulo}
              </h2>
              <div className="flex flex-col gap-2.5">
                {dia.itens.map(({ booking, studentName }) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => navigate(`/admin/aula/${booking.id}`)}
                    className="w-full text-left card-dark p-3.5 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14.5px] font-semibold text-foreground">{studentName}</div>
                        <div className="text-[12.5px] text-muted-foreground mt-0.5">
                          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                        </div>
                      </div>
                      {booking.isReplacement && <Badge className="bg-secondary text-muted-foreground">Reposição</Badge>}
                      <StatusBadge
                        status={booking.status}
                        semRegistro={isAwaitingConfirmation(booking.status, booking.endTime)}
                        agora={booking.status === "scheduled" && new Date(booking.startTime).getTime() <= Date.now() && new Date(booking.endTime).getTime() > Date.now()}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!isLoading && !isError && data && aulas.length > 0 && (
        <div className="mt-2 text-center">
          <div className="text-[12.5px] text-muted-foreground mb-2.5" aria-live="polite">
            {hasNextPage
              ? `Mostrando as ${aulas.length} ${periodo === "proximas" ? "mais próximas" : "mais recentes"}`
              : aulas.length === 1
                ? "1 aula no total"
                : `${aulas.length} aulas no total`}
          </div>
          {hasNextPage && (
            <Button variant="secondary" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? "Carregando…" : "Ver mais aulas"}
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && data && aulas.length === 0 && (
        // Dois vazios diferentes: "sem resultado para o que você pediu" (com saída: limpar) e "ainda não há aula"
        // (antes os dois diziam "Ajuste a busca ou o status", que sem nenhum filtro ligado não fazia sentido).
        buscaAplicada.trim() || statusFilter !== "todas" ? (
          <EmptyState
            icon={CalendarX}
            title="Nenhuma aula encontrada"
            description="Nada bate com a busca e o filtro escolhidos."
            ctaLabel="Limpar busca e filtro"
            ctaVariant="secondary"
            onCta={() => {
              setSearch("");
              setBuscaAplicada("");
              setStatusFilter("todas");
            }}
          />
        ) : periodo === "proximas" ? (
          <EmptyState
            icon={CalendarX}
            title="Nenhuma aula marcada"
            description="As próximas aulas dos seus alunos aparecem aqui."
            ctaLabel="Ver agenda"
            ctaVariant="secondary"
            onCta={() => navigate("/admin/agenda")}
          />
        ) : (
          <EmptyState icon={CalendarX} title="Nenhuma aula anterior ainda" description="Quando as aulas acontecerem, elas ficam guardadas aqui." />
        )
      )}
    </div>
  );
}
