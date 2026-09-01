import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BookingCard } from "@/components/BookingCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDayNumber, formatMonthShort, formatTime } from "@/lib/dateUtils";
import { getStudentBookingHistory } from "@/integrations/backend/api";

type Tab = "proximas" | "anteriores" | "todas";

export default function StudentHistorico() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("proximas");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-history", profile?.id, tab],
    queryFn: () => getStudentBookingHistory(profile!.id, tab),
    enabled: !!profile,
  });

  return (
    <div className="page-container">
      <div className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">MINHAS AULAS</div>
      <div className="text-[12.5px] text-muted-foreground mb-4">Histórico completo do seu pacote</div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="proximas">Próximas</TabsTrigger>
          <TabsTrigger value="anteriores">Anteriores</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={4} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map((b) => (
            <BookingCard
              key={b.id}
              dayNumber={formatDayNumber(b.startTime)}
              monthLabel={formatMonthShort(b.startTime)}
              title={`${formatTime(b.startTime)} – ${formatTime(b.endTime)}`}
              status={b.status}
              onClick={() => navigate(`/app/aula/${b.id}`)}
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="Nada por aqui"
          description="Você ainda não tem aulas neste filtro."
          ctaLabel="Agendar aula"
          onCta={() => navigate("/app/agendar")}
        />
      )}
    </div>
  );
}
