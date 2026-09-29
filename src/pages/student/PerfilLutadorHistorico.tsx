import { FighterProfileGloss } from "@/components/FighterProfileGloss";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { formatDateWithYear } from "@/lib/dateUtils";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILE_LABELS, SCORING_VERSION, type Dimension } from "@/lib/boxingProfile";
import { getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

type Linha = { dim: Dimension; from: number; to: number; delta: number };

/** Uma competência: duas barras rotuladas com a data (primeira e mais recente) e a diferença em palavras — sem vermelho para quedas. */
function LinhaCompetencia({ linha, de, para }: { linha: Linha; de: string; para: string }) {
  const { dim, from, to, delta } = linha;
  const texto =
    delta > 0
      ? `Subiu ${delta} ${delta === 1 ? "ponto" : "pontos"}`
      : delta === 0
        ? "Ficou igual"
        : `Ficou em ${to}, ${Math.abs(delta)} a menos`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5" aria-hidden>
        <span className="text-[13.5px] font-semibold text-foreground">{DIMENSION_LABELS[dim]}</span>
        <span className="text-[12.5px] text-muted-foreground text-right">{texto}</span>
      </div>
      {[
        { data: de, valor: from, cor: "bg-muted-foreground" },
        { data: para, valor: to, cor: "bg-accent" },
      ].map((b) => (
        <div key={b.data} className="flex items-center gap-2 mt-1" aria-hidden>
          <span className="w-[86px] shrink-0 text-xs text-muted-foreground">{formatDateWithYear(b.data)}</span>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full rounded-full ${b.cor}`} style={{ width: `${b.valor}%` }} />
          </div>
          <span className="w-7 shrink-0 text-right text-xs text-foreground tabular-nums">{b.valor}</span>
        </div>
      ))}
      {/* As barras são só para a vista; o leitor de tela recebe os dois números e a diferença em texto. */}
      <span className="sr-only">
        {`${DIMENSION_LABELS[dim]}: de ${from} para ${to}. ${texto}.`}
      </span>
    </div>
  );
}

export default function StudentPerfilLutadorHistorico() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const { data: rawHistory, isLoading, isError, refetch } = useQuery({
    queryKey: ["boxing-profile-history", studentId],
    queryFn: () => getBoxingProfileHistory(studentId!),
    enabled: !!studentId,
  });

  // "Minha evolução" é sobre a AUTOPERCEPÇÃO do aluno ao longo do tempo — `getBoxingProfileHistory`
  // também traz avaliações 'coach' (o professor pode ler as do próprio aluno, migration 0007), que
  // não pertencem a essa linha do tempo. Comparar a nota do aluno hoje com a leitura de outra
  // pessoa no passado não seria "evolução", seria misturar dois avaliadores diferentes — essa
  // comparação é a tela de "Perfil de Boxe" (`PerfilLutador.tsx`), inline, quando as duas existem.
  const history = rawHistory?.filter((a) => a.assessmentType === "self");

  // "Evolução por dimensão" só usa avaliações completas: a curta tem 1 pergunta por dimensão em
  // vez de 3-4, uma medição bem mais ruidosa — misturar as duas no mesmo gráfico de tendência
  // sugeriria uma precisão que a curta não tem (CLAUDE.md, "Compatibilidade entre curta e
  // completa"). A lista "Avaliações realizadas" abaixo continua mostrando as duas, com um selo.
  // Também só a fórmula ATUAL: uma nota calculada pela fórmula anterior contra uma da atual mostraria uma "queda" (ou
  // subida) que vem do cálculo, não do aluno. Elas continuam na lista, com o selo.
  const fullHistory = history?.filter((a) => a.assessmentLength === "full" && a.scoringVersion === SCORING_VERSION);
  const temFormulaAnterior = !!history?.some((a) => a.assessmentLength === "full" && a.scoringVersion !== SCORING_VERSION);

  // Do mais antigo pro mais recente — é a ordem que a visão de evolução por dimensão precisa.
  const chronological = fullHistory ? [...fullHistory].reverse() : [];
  const oldest = chronological[0];
  const newest = chronological[chronological.length - 1];
  const temEvolucao = chronological.length >= 2;
  // Não depende da ordem em que o banco devolve a lista.
  const maisRecenteId = history?.reduce<(typeof history)[number] | undefined>(
    (m, a) => (!m || a.completedAt > m.completedAt ? a : m),
    undefined,
  )?.id;

  // Primeira × mais recente, por competência; quem mais subiu (até 2, só se subiu de fato) abre a lista, o resto fica recolhido.
  const linhas: Linha[] =
    oldest && newest
      ? DIMENSIONS.map((dim) => {
          const from = oldest.dimensionScores[dim];
          const to = newest.dimensionScores[dim];
          return { dim, from, to, delta: to - from };
        })
      : [];
  const destaques = linhas
    .filter((l) => l.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2);
  const resto = linhas.filter((l) => !destaques.includes(l));
  const [verTodas, setVerTodas] = useState(false);

  function novaAvaliacao() {
    navigate("/app/perfil-lutador/questionario");
  }

  return (
    <div className="page-container">
      <PageHeader title="MINHA EVOLUÇÃO" back />

      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={80} />}

      {!isLoading && !isError && history && history.length === 0 && (
        <EmptyState
          icon={History}
          title="Nenhuma avaliação ainda"
          description="Faça sua primeira autoavaliação de Perfil de Boxe para começar a acompanhar sua evolução."
          ctaLabel="Fazer minha primeira avaliação"
          onCta={novaAvaliacao}
        />
      )}

      {!isLoading && !isError && history && history.length > 0 && (
        <>
          {/* Sem 2 avaliações completas o gráfico não existe: antes ele sumia em silêncio e o aluno achava que a tela quebrou. */}
          {!temEvolucao && (
            <div className="card-dark p-4 mb-5">
              <h2 className="text-[15px] font-semibold text-foreground mb-1.5">Sua evolução ainda não aparece aqui</h2>
              <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-4">
                {chronological.length === 1 && newest
                  ? `Você tem 1 avaliação completa (${formatDateWithYear(newest.completedAt)}). Faça mais uma avaliação completa para comparar suas competências.`
                  : "Para ver sua evolução por competência, faça pelo menos 2 avaliações completas."}
                {history.some((a) => a.assessmentLength === "short") &&
                  " As rápidas medem menos e não entram nessa comparação."}
                {temFormulaAnterior &&
                  " As avaliações da fórmula anterior também ficam de fora, porque as notas eram calculadas de outro jeito."}
              </p>
              <Button size="lg" className="w-full" onClick={novaAvaliacao}>
                Fazer nova avaliação
              </Button>
            </div>
          )}

          {temEvolucao && oldest && newest && (
            <>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">
                Evolução por competência
              </h2>
              <div className="text-xs text-muted-foreground leading-relaxed mb-3">
                Comparando sua primeira avaliação completa ({formatDateWithYear(oldest.completedAt)}) com a mais recente (
                {formatDateWithYear(newest.completedAt)}).
              </div>
              {destaques.length > 0 && (
                <p className="text-[15px] font-semibold text-foreground mb-3">
                  Você subiu mais em {destaques.map((l) => DIMENSION_LABELS[l.dim]).join(" e ")}.
                </p>
              )}
              <div className="card-dark p-4 mb-3">
                <div className="flex flex-col gap-4">
                  {(verTodas || destaques.length === 0 ? linhas : destaques).map((l) => (
                    <LinhaCompetencia key={l.dim} linha={l} de={oldest.completedAt} para={newest.completedAt} />
                  ))}
                </div>
              </div>
              {destaques.length > 0 && resto.length > 0 && (
                <Button
                  variant="secondary"
                  className="w-full mb-3"
                  aria-expanded={verTodas}
                  onClick={() => setVerTodas((v) => !v)}
                >
                  {verTodas ? "Mostrar só as que mais subiram" : `Ver as outras ${resto.length} competências`}
                </Button>
              )}
              {linhas.some((l) => l.delta < 0) && (
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Uma nota mais baixa não quer dizer que você piorou: pode ser uma leitura mais atenta de si mesmo. Converse com o seu
                  professor sobre isso.
                </p>
              )}
              <div className="h-2" />
            </>
          )}

          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">Avaliações realizadas</h2>
          <p className="text-xs text-muted-foreground mb-2.5">Da mais recente para a mais antiga. Toque em uma para abrir o resultado.</p>
          <ul className="flex flex-col gap-2.5" aria-label="Avaliações realizadas">
            {[...history].sort((x, y) => y.completedAt.localeCompare(x.completedAt)).map((a) => {
              const maisRecente = history.length > 1 && a.id === maisRecenteId;
              const antiga = a.scoringVersion !== SCORING_VERSION;
              return (
              <li key={a.id}>
              <button
                type="button"
                onClick={() => navigate(`/app/perfil-lutador/resultado/${a.id}`)}
                aria-label={`${FIGHTER_PROFILE_LABELS[a.primaryProfile]}, ${a.profileScores[a.primaryProfile]}% de afinidade, ${formatDateWithYear(a.completedAt)}, versão ${a.assessmentLength === "short" ? "rápida" : "completa"}${antiga ? ", calculada pela fórmula anterior" : ""}${maisRecente ? ", a mais recente" : ""}`}
                className="card-dark p-4 text-left w-full active:scale-[0.99] motion-reduce:active:scale-100 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="min-w-0 text-[14.5px] font-semibold text-foreground">
                    {FIGHTER_PROFILE_LABELS[a.primaryProfile]}
                    <FighterProfileGloss profile={a.primaryProfile} />
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{formatDateWithYear(a.completedAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] text-accent font-semibold">{a.profileScores[a.primaryProfile]}% de afinidade</span>
                  {maisRecente && (
                    <span className="text-xs font-bold uppercase tracking-wide text-foreground bg-secondary rounded-full px-2 py-0.5">
                      Mais recente
                    </span>
                  )}
                  {a.scoringVersion !== SCORING_VERSION && (
                    <span className="text-xs font-bold uppercase tracking-wide text-amber bg-amber/10 rounded-full px-2 py-0.5">
                      Calculado pela fórmula anterior
                    </span>
                  )}
                  {a.assessmentLength === "short" && (
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
                      Rápida
                    </span>
                  )}
                </div>
              </button>
              </li>
              );
            })}
          </ul>

          {/* Uma só ação principal por tela: com o cartão de "evolução ainda não aparece", o botão mora nele. */}
          {temEvolucao && (
            <div className="mt-6">
              <Button size="lg" className="w-full" onClick={novaAvaliacao}>
                Nova autoavaliação
              </Button>
              <p className="text-center text-[13px] text-muted-foreground mt-2.5">
                Refaça de tempos em tempos para acompanhar sua evolução.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
