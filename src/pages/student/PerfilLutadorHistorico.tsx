import { FighterProfileGloss } from "@/components/FighterProfileGloss";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/dateUtils";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILE_LABELS, SCORING_VERSION } from "@/lib/boxingProfile";
import { getBoxingProfileHistory, studentIdForProfile } from "@/integrations/backend/api";

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
                  ? `Você tem 1 avaliação completa (${formatDateShort(newest.completedAt)}). Faça mais uma avaliação completa para comparar suas competências.`
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
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">
                Evolução por dimensão
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed mb-3">
                Comparando sua primeira autoavaliação ({formatDateShort(oldest.completedAt)}) com a mais recente (
                {formatDateShort(newest.completedAt)}).
              </div>
              <div className="card-dark p-4 mb-5">
                <div className="flex flex-col gap-3.5">
                  {DIMENSIONS.map((dim) => {
                    const from = oldest.dimensionScores[dim];
                    const to = newest.dimensionScores[dim];
                    return (
                      <div key={dim}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[13px] font-medium text-foreground">{DIMENSION_LABELS[dim]}</span>
                          <span className="text-[12px] text-muted-foreground tabular-nums">
                            {from} → {to}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {chronological.map((a) => (
                            <div key={a.id} className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-accent" style={{ width: `${a.dimensionScores[dim]}%` }} />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
                          Sua autoavaliação de {DIMENSION_LABELS[dim]} mudou de {from} para {to} nesse período.
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">Avaliações realizadas</div>
          <div className="flex flex-col gap-2.5">
            {history.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/app/perfil-lutador/resultado/${a.id}`)}
                className="card-dark p-4 text-left w-full active:scale-[0.99] transition-transform"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[14.5px] font-semibold text-foreground">
                    {FIGHTER_PROFILE_LABELS[a.primaryProfile]}
                    <FighterProfileGloss profile={a.primaryProfile} />
                  </span>
                  <span className="text-[12px] text-muted-foreground">{formatDateShort(a.completedAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] text-accent font-semibold">{a.profileScores[a.primaryProfile]}% de afinidade</span>
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
            ))}
          </div>

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
