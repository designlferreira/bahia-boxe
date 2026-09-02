import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonList } from "@/components/SkeletonCard";
import { formatDateShort } from "@/lib/dateUtils";
import { DIMENSIONS, DIMENSION_LABELS, FIGHTER_PROFILE_LABELS } from "@/lib/boxingProfile";
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
  // comparação tem tela própria (`/app/perfil-lutador/comparacao`).
  const history = rawHistory?.filter((a) => a.assessmentType === "self");

  // Do mais antigo pro mais recente — é a ordem que a visão de evolução por dimensão precisa.
  const chronological = history ? [...history].reverse() : [];
  const oldest = chronological[0];
  const newest = chronological[chronological.length - 1];

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
        />
      )}

      {!isLoading && !isError && history && history.length > 0 && (
        <>
          {history.length >= 2 && oldest && newest && (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2.5">
                Evolução por dimensão
              </div>
              <div className="text-[11.5px] text-muted-foreground leading-relaxed mb-3">
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
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1.5">
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
                  <span className="text-[14.5px] font-semibold text-foreground">{FIGHTER_PROFILE_LABELS[a.primaryProfile]}</span>
                  <span className="text-[12px] text-muted-foreground">{formatDateShort(a.completedAt)}</span>
                </div>
                <div className="text-[12.5px] text-accent font-semibold">{a.profileScores[a.primaryProfile]}% de compatibilidade</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
