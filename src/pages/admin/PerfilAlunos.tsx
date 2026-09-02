import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { getStudentProfileStats, type CategoryStats, type NumericStats } from "@/integrations/backend/api";
import { GUARD_LABELS, LATERALITY_LABELS, SEX_LABELS } from "@/lib/studentProfile";
import type { Guard, Laterality, Sex } from "@/integrations/backend/types";

export default function AdminPerfilAlunos() {
  const { profile } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-profile-stats", profile?.id],
    queryFn: () => getStudentProfileStats(profile!.id),
    enabled: !!profile,
  });

  return (
    <div className="page-container">
      <PageHeader title="PERFIL DOS ALUNOS" subtitle="Dados que os próprios alunos preencheram" back />

      {isLoading && <SkeletonCard height={280} />}
      {isError && <div className="text-[13px] text-destructive">Não foi possível carregar os dados.</div>}

      {!isLoading && !isError && data && data.totalStudents === 0 && (
        <EmptyState icon={Users} title="Nenhum aluno ainda" description="As análises aparecem aqui assim que você tiver alunos." />
      )}

      {!isLoading && !isError && data && data.totalStudents > 0 && (
        <div className="flex flex-col gap-3.5">
          <CategoryCard title="Lateralidade" stats={data.laterality} labels={LATERALITY_LABELS} total={data.totalStudents} order={["right", "left", "ambidextrous"] as Laterality[]} />
          <CategoryCard title="Guarda" stats={data.guard} labels={GUARD_LABELS} total={data.totalStudents} order={["orthodox", "southpaw", "switch"] as Guard[]} />
          <CategoryCard title="Sexo" stats={data.sex} labels={SEX_LABELS} total={data.totalStudents} order={["female", "male", "other"] as Sex[]} />
          <NumericCard title="Altura" unit="cm" stats={data.heightCm} total={data.totalStudents} />
          <NumericCard title="Peso" unit="kg" stats={data.weightKg} total={data.totalStudents} />
        </div>
      )}
    </div>
  );
}

function CategoryCard<T extends string>({
  title,
  stats,
  labels,
  total,
  order,
}: {
  title: string;
  stats: CategoryStats<T>;
  labels: Record<T, string>;
  total: number;
  order: T[];
}) {
  return (
    <div className="card-dark p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-display text-lg tracking-wide text-foreground">{title.toUpperCase()}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {stats.filled} de {total} preencheram
        </div>
      </div>
      {stats.filled === 0 ? (
        <div className="text-[12.5px] text-muted-foreground">Ninguém preencheu ainda.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {order.map((key) => {
            const count = stats.breakdown[key] ?? 0;
            if (count === 0) return null;
            const pct = Math.round((count / stats.filled) * 100);
            return (
              <div key={key}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="text-foreground/85">{labels[key]}</span>
                  <span className="text-muted-foreground">{pct}% · {count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NumericCard({ title, unit, stats, total }: { title: string; unit: string; stats: NumericStats; total: number }) {
  return (
    <div className="card-dark p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-display text-lg tracking-wide text-foreground">{title.toUpperCase()}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {stats.filled} de {total} preencheram
        </div>
      </div>
      {stats.filled === 0 ? (
        <div className="text-[12.5px] text-muted-foreground">Ninguém preencheu ainda.</div>
      ) : (
        <div className="flex gap-4">
          <Stat label="Média" value={`${stats.avg!.toFixed(1)} ${unit}`} />
          <Stat label="Mínimo" value={`${stats.min} ${unit}`} />
          <Stat label="Máximo" value={`${stats.max} ${unit}`} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[15px] font-semibold text-foreground">{value}</div>
    </div>
  );
}
