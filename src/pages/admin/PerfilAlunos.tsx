import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { getStudentProfileStats, type CategoryStats, type NumericStats } from "@/integrations/backend/api";
import { GUARD_LABELS, LATERALITY_LABELS, MIN_ALUNOS_NA_ESTATISTICA, SEX_LABELS } from "@/lib/studentProfile";
import type { Guard, Laterality, Sex } from "@/integrations/backend/types";

export default function AdminPerfilAlunos() {
  const { profile } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-profile-stats", profile?.id],
    queryFn: () => getStudentProfileStats(profile!.id),
    enabled: !!profile,
  });

  // Há alunos, mas ninguém preencheu nada: um aviso só, no lugar de cinco cartões iguais dizendo "Ninguém preencheu ainda".
  const ninguemPreencheu =
    !!data &&
    data.totalStudents > 0 &&
    data.sex.filled === 0 &&
    data.guard.filled === 0 &&
    data.laterality.filled === 0 &&
    data.heightCm.filled === 0 &&
    data.weightKg.filled === 0;

  return (
    <div className="page-container">
      <PageHeader title="PERFIL DOS ALUNOS" subtitle="Dados que os próprios alunos preencheram" back />

      {/* Esqueleto com a forma da página (cinco cartões), não um bloco de 280px numa página de ~1000px. Também cobre a consulta
          ainda desligada (sem perfil), que antes deixava só o título na tela. */}
      {!isError && (isLoading || !data) && (
        <div aria-busy="true" className="flex flex-col gap-3.5">
          <p role="status" className="sr-only">
            Carregando o perfil dos alunos…
          </p>
          <SkeletonCard height={96} />
          <SkeletonCard height={190} />
          <SkeletonCard height={96} />
          <SkeletonCard height={84} />
          <SkeletonCard height={84} />
        </div>
      )}
      {/* Falha ≠ vazio: com o botão de tentar de novo (antes uma linha de texto vermelho solto, sem `role=alert`). */}
      {isError && (
        <ErrorState
          title="Não conseguimos carregar o perfil dos alunos"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data && data.totalStudents === 0 && (
        <EmptyState icon={Users} title="Nenhum aluno ainda" description="As análises aparecem aqui assim que você tiver alunos." />
      )}

      {ninguemPreencheu && (
        <EmptyState
          icon={Users}
          title="Ninguém preencheu ainda"
          description={`Os alunos preenchem em Minha conta > Meus dados físicos, e é opcional. Os números aparecem aqui quando pelo menos ${MIN_ALUNOS_NA_ESTATISTICA} tiverem preenchido cada dado.`}
        />
      )}

      {!isLoading && !isError && data && data.totalStudents > 0 && !ninguemPreencheu && (
        <div className="flex flex-col gap-3.5">
          <CategoryCard title="Lateralidade" stats={data.laterality} labels={LATERALITY_LABELS} total={data.totalStudents} order={["right", "left", "ambidextrous"] as Laterality[]} />
          <CategoryCard
            title="Guarda"
            stats={data.guard}
            labels={GUARD_LABELS}
            total={data.totalStudents}
            order={["orthodox", "southpaw", "switch", "peekaboo", "cross_arm", "philly_shell", "long_guard"] as Guard[]}
          />
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
        <h2 className="section-title">{title}</h2>
        <div className="text-[11.5px] text-muted-foreground">
          {stats.filled} de {total} preencheram
        </div>
      </div>
      {stats.filled < MIN_ALUNOS_NA_ESTATISTICA ? (
        <PoucosAlunos filled={stats.filled} total={total} />
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
        <h2 className="section-title">{title}</h2>
        <div className="text-[11.5px] text-muted-foreground">
          {stats.filled} de {total} preencheram
        </div>
      </div>
      {stats.filled < MIN_ALUNOS_NA_ESTATISTICA ? (
        <PoucosAlunos filled={stats.filled} total={total} />
      ) : (
        // Só a MÉDIA: o mínimo e o máximo são, por definição, o dado de um aluno (o mais baixo, o mais pesado), mesmo com muita gente.
        <div className="flex gap-4">
          <Stat label="Média" value={`${stats.avg!.toFixed(1).replace(".", ",")} ${unit}`} />
        </div>
      )}
    </div>
  );
}

/**
 * Com poucos alunos a média (e as porcentagens) são o dado de UM aluno, e o aluno foi avisado de que o professor não vê os números
 * dele. Em vez de esconder sem dizer nada, a tela explica o motivo.
 */
function PoucosAlunos({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="text-[12.5px] text-muted-foreground leading-snug">
      {filled === 0
        ? "Ninguém preencheu ainda."
        : `Poucos alunos preencheram ainda (${filled} de ${total}). Os números aparecem a partir de ${MIN_ALUNOS_NA_ESTATISTICA}, para não expor o dado de cada um.`}
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
