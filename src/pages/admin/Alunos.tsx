import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { getAdminStudents, getAlunosEmRisco } from "@/integrations/backend/api";

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "risco", label: "Em risco" },
];

export default function AdminAlunos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // Filtro na URL (`?filtro=risco`): o "Ver todos" do painel cai direto aqui já filtrado, e voltar
  // pelo navegador mantém o filtro.
  const [params, setParams] = useSearchParams();
  const soRisco = params.get("filtro") === "risco";

  const { data: todos, isLoading: carregandoTodos, isError: erroTodos, refetch } = useQuery({
    queryKey: ["admin-students", profile?.id, search],
    queryFn: () => getAdminStudents(profile!.id, search),
    enabled: !!profile,
  });
  const { data: risco, isLoading: carregandoRisco, isError: erroRisco, refetch: refetchRisco } = useQuery({
    queryKey: ["alunos-em-risco", profile?.id],
    queryFn: () => getAlunosEmRisco(profile!.id),
    enabled: !!profile && soRisco,
  });

  const motivoPorAluno = new Map((risco ?? []).map((r) => [r.student.id, r]));
  // Em risco: na ordem do painel (mais urgente primeiro), não na ordem alfabética da lista.
  const data =
    soRisco && todos && risco
      ? risco.flatMap((r) => todos.filter((e) => e.student.id === r.student.id))
      : soRisco
        ? undefined
        : todos;
  const isLoading = carregandoTodos || (soRisco && carregandoRisco);
  const isError = erroTodos || (soRisco && erroRisco);

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-3.5">ALUNOS</h1>
      <BookingFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar aluno"
        filters={FILTROS}
        activeFilter={soRisco ? "risco" : "todos"}
        onFilterChange={(v) => setParams(v === "risco" ? { filtro: "risco" } : {}, { replace: true })}
      />
      {soRisco && <div className="text-sm text-muted-foreground -mt-1.5 mb-3">Pacote acabando ou faltas seguidas.</div>}

      {isError && (
        <ErrorState
          title="Não foi possível carregar os alunos"
          onRetry={() => {
            refetch();
            if (soRisco) refetchRisco();
          }}
        />
      )}
      {isLoading && !isError && <SkeletonList count={5} height={72} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map(({ student, credits, package: pkg }) => {
            const emRisco = motivoPorAluno.get(student.id);
            return (
            <button
              key={student.id}
              type="button"
              onClick={() => navigate(`/admin/alunos/${student.id}`)}
              className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform hover:border-muted-foreground/40"
            >
              <div className="h-[42px] w-[42px] rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground/80 shrink-0">
                {student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-foreground truncate">{student.name}</div>
                {soRisco && emRisco ? (
                  <div className={`text-[12.5px] ${emRisco.grave ? "text-[hsl(var(--red-text))]" : "text-amber"}`}>{emRisco.motivo}</div>
                ) : (
                  <div className="text-[12.5px] text-muted-foreground truncate">
                    {pkg ? `${pkg.templateName} · ${pkg.usedClasses}/${pkg.totalClasses} usadas` : "Sem pacote ativo"}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className={`font-display text-2xl leading-none ${credits === 0 ? "text-destructive" : credits <= 2 ? "text-amber" : "text-accent"}`}>
                  {credits}
                </div>
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">créditos</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && soRisco && !search && (
        <EmptyState
          icon={Users}
          title="Nenhum aluno em risco"
          description="Quando um pacote estiver acabando ou um aluno faltar seguido, ele aparece aqui."
          ctaLabel="Ver todos os alunos"
          onCta={() => setParams({}, { replace: true })}
        />
      )}

      {!isLoading && !isError && data && data.length === 0 && !(soRisco && !search) && (
        <EmptyState
          icon={Users}
          title="Nenhum aluno encontrado"
          description={search ? `Nenhum resultado para "${search}".` : "Convide um novo aluno para começar."}
          ctaLabel={search ? "Limpar busca" : undefined}
          onCta={search ? () => setSearch("") : undefined}
        />
      )}
    </div>
  );
}
