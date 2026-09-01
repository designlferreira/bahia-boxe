import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { getAdminStudents } from "@/integrations/backend/api";

export default function AdminAlunos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-students", profile?.id, search],
    queryFn: () => getAdminStudents(profile!.id, search),
    enabled: !!profile,
  });

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-3.5">ALUNOS</h1>
      <BookingFilters search={search} onSearchChange={setSearch} searchPlaceholder="Buscar aluno" />

      {isError && <ErrorState title="Não foi possível carregar os alunos" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={5} height={72} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map(({ student, credits, package: pkg }) => (
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
                <div className="text-[12.5px] text-muted-foreground truncate">
                  {pkg ? `${pkg.templateName} · ${pkg.usedClasses}/${pkg.totalClasses} usadas` : "Sem pacote ativo"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-display text-2xl leading-none ${credits === 0 ? "text-destructive" : credits <= 2 ? "text-amber" : "text-accent"}`}>
                  {credits}
                </div>
                <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">créditos</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
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
