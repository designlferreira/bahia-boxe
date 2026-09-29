import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BookingFilters } from "@/components/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { getAdminStudents, getAlunosEmRisco, semAcento } from "@/integrations/backend/api";

type Filtro = "todos" | "risco" | "sem-pacote";
const DESCRICAO: Partial<Record<Filtro, string>> = {
  risco: "Pacote acabando ou faltas seguidas.",
  "sem-pacote": "Alunos sem nenhum pacote ativo.",
};

export default function AdminAlunos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // Filtro na URL (`?filtro=risco`): o "Ver todos" do painel cai direto aqui já filtrado, e voltar
  // pelo navegador mantém o filtro.
  const [params, setParams] = useSearchParams();
  const filtroParam = params.get("filtro");
  const filtro: Filtro = filtroParam === "risco" || filtroParam === "sem-pacote" ? filtroParam : "todos";
  const soRisco = filtro === "risco";

  // A lista é buscada UMA vez e a busca filtra em memória: com o texto na chave da consulta, cada letra digitada trocava a
  // chave, a lista inteira virava esqueleto e o app refazia 3 consultas por tecla. Sem acento nem maiúscula ("jose" acha "José").
  const { data: lista, isLoading: carregandoTodos, isError: erroTodos, refetch } = useQuery({
    queryKey: ["admin-students", profile?.id],
    queryFn: () => getAdminStudents(profile!.id, ""),
    enabled: !!profile,
  });
  const termo = semAcento(search);
  // Ordem estável por nome: a consulta não define ordem, então a lista podia mudar de uma visita pra outra.
  const ordenada = lista ? [...lista].sort((a, b) => a.student.name.localeCompare(b.student.name, "pt-BR")) : lista;
  const todos =
    ordenada && termo ? ordenada.filter((e) => semAcento(e.student.name).includes(termo)) : ordenada;
  const semPacote = todos ? todos.filter((e) => e.restantes === null) : undefined;
  const { data: risco, isLoading: carregandoRisco, isError: erroRisco, refetch: refetchRisco } = useQuery({
    queryKey: ["alunos-em-risco", profile?.id],
    queryFn: () => getAlunosEmRisco(profile!.id),
    // Sempre: o chip "Em risco" mostra a contagem mesmo com outro filtro ativo.
    enabled: !!profile,
  });

  const motivoPorAluno = new Map((risco ?? []).map((r) => [r.student.id, r]));
  // Em risco: na ordem do painel (mais urgente primeiro), não na ordem alfabética da lista.
  const data =
    filtro === "risco"
      ? todos && risco
        ? risco.flatMap((r) => todos.filter((e) => e.student.id === r.student.id))
        : undefined
      : filtro === "sem-pacote"
        ? semPacote
        : todos;
  // Contagens sobre TODOS os alunos (não sobre a busca): o número do chip não pode mudar a cada letra digitada.
  const total = ordenada?.length;
  const totalSemPacote = ordenada?.filter((e) => e.restantes === null).length;
  const comContagem = (label: string, n: number | undefined) => (n === undefined ? label : `${label} ${n}`);
  const FILTROS = [
    { value: "todos", label: comContagem("Todos", total) },
    { value: "risco", label: comContagem("Em risco", risco?.length) },
    { value: "sem-pacote", label: comContagem("Sem pacote", totalSemPacote) },
  ];
  const isLoading = carregandoTodos || (soRisco && carregandoRisco);
  const isError = erroTodos || (soRisco && erroRisco);
  const filtrado = filtro !== "todos";

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-3.5">ALUNOS</h1>
      <BookingFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar aluno"
        filters={FILTROS}
        activeFilter={filtro}
        onFilterChange={(v) => setParams(v === "todos" ? {} : { filtro: v }, { replace: true })}
      />
      {DESCRICAO[filtro] && <div className="text-sm text-muted-foreground -mt-1.5 mb-3">{DESCRICAO[filtro]}</div>}

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
          {data.map(({ student, restantes, package: pkg }) => {
            const emRisco = motivoPorAluno.get(student.id);
            return (
            <button
              key={student.id}
              type="button"
              onClick={() => navigate(`/admin/alunos/${student.id}`)}
              className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform hover:border-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex-1 min-w-0">
                {/* Sem avatar de iniciais (repetia o nome e tomava ~54px): com a coluna mais larga o nome cabe inteiro
                    ou quebra em 2 linhas, em vez de "Ana Beatriz Sou…" — dois alunos com o mesmo primeiro nome ficavam iguais. */}
                <div className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 break-words">{student.name}</div>
                {soRisco && emRisco ? (
                  <div className={`text-[12.5px] ${emRisco.grave ? "text-[hsl(var(--red-text))]" : "text-amber"}`}>{emRisco.motivo}</div>
                ) : (
                  // O número de aulas restantes já está à direita; repetir "5/8 usadas" só cortava o texto. O detalhe do aluno tem o resto.
                  <div className="text-[12.5px] text-muted-foreground line-clamp-2 break-words">
                    {pkg ? pkg.templateName : "Sem pacote ativo"}
                  </div>
                )}
              </div>
              {restantes !== null && (
                <div className="text-right shrink-0">
                  <div
                    className={`font-display text-2xl leading-none ${
                      restantes === 0 ? "text-[hsl(var(--red-text))]" : restantes <= 2 ? "text-amber" : "text-foreground"
                    }`}
                  >
                    {restantes}
                  </div>
                  <div className="text-xs text-muted-foreground">{restantes === 1 ? "restante" : "restantes"}</div>
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            </button>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && filtrado && !search && (
        <EmptyState
          icon={Users}
          title={soRisco ? "Nenhum aluno em risco" : "Todos os alunos têm pacote ativo"}
          description={
            soRisco
              ? "Quando um pacote estiver acabando ou um aluno faltar seguido, ele aparece aqui."
              : "Quando um aluno ficar sem pacote, ele aparece aqui."
          }
          ctaLabel="Ver todos os alunos"
          onCta={() => setParams({}, { replace: true })}
        />
      )}

      {!isLoading && !isError && data && data.length === 0 && !(filtrado && !search) && (
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
