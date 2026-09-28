import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SkeletonCard } from "@/components/SkeletonCard";
import { FIGHTER_PROFILE_GLOSS_PT, FIGHTER_PROFILE_LABELS, type FighterProfileKey } from "@/lib/boxingProfile";
import { cn } from "@/lib/utils";
import { combineAssessments } from "@/lib/boxingProfile/combined";
import {
  getBoxingProfileAssessment,
  getBoxingProfileHistory,
  getNotifications,
  studentIdForProfile,
} from "@/integrations/backend/api";

/** Mesmo id que `deriveNotifications` dá ao aviso "Seu professor te avaliou". */
export function coachAssessmentNotificationId(assessmentId: string) {
  return `boxing-profile:${assessmentId}`;
}

/**
 * Cartão "Perfil de Boxe" da Home do aluno — identidade de lutador, discreto, abaixo do botão
 * principal (o saldo continua sendo o destaque da tela). Plano confirmado em 2026-09-28:
 *
 * - nunca se avaliou → convite pro questionário (único estado com chamada pra ação);
 * - só um lado avaliou → arquétipo daquele lado, dizendo de quem é a leitura quando é do professor;
 * - os dois avaliaram → arquétipo do RESULTADO COMBINADO, o mesmo que a tela de comparação calcula
 *   (`combineAssessments`), pra os dois lugares nunca divergirem. Divergência entre aluno e
 *   professor NÃO aparece aqui — a tela de comparação já trata isso com cuidado;
 * - avaliação do professor ainda não vista → linha âmbar "Seu professor te avaliou". "Vista" = a
 *   notificação correspondente marcada como lida (abrir o Perfil de Boxe marca).
 *
 * Usa as mesmas chaves de consulta que `PerfilLutador.tsx` e o sino, então não duplica busca
 * quando o aluno navega entre as telas. Se falhar, some em silêncio: não é o dado principal da
 * Home, e um erro aqui não deveria disputar espaço com o saldo.
 */
export function BoxingProfileHomeCard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const { data: history, isLoading, isError } = useQuery({
    queryKey: ["boxing-profile-history", studentId],
    queryFn: () => getBoxingProfileHistory(studentId!),
    enabled: !!studentId,
  });

  const self = history?.find((a) => a.assessmentType === "self");
  const coach = history?.find((a) => a.assessmentType === "coach");
  const bothExist = !!self && !!coach;

  // O combinado precisa dos registros completos (com `answers`) — só quando os dois existem.
  const selfFull = useQuery({
    queryKey: ["boxing-profile-assessment", self?.id],
    queryFn: () => getBoxingProfileAssessment(self!.id),
    enabled: bothExist,
  });
  const coachFull = useQuery({
    queryKey: ["boxing-profile-assessment", coach?.id],
    queryFn: () => getBoxingProfileAssessment(coach!.id),
    enabled: bothExist,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications", profile?.id],
    queryFn: () => getNotifications(profile!.id),
    enabled: !!profile && !!coach,
  });

  if (!profile || isError) return null;
  if (!studentId || isLoading || (bothExist && (selfFull.isLoading || coachFull.isLoading))) {
    return <SkeletonCard height={92} className="mt-6" />;
  }

  let primary: FighterProfileKey | null = null;
  let secondary: FighterProfileKey | null = null;
  let source: "self" | "coach" | "combined" | null = null;

  if (bothExist && selfFull.data && coachFull.data) {
    const combined = combineAssessments(selfFull.data, coachFull.data);
    if (combined) {
      primary = combined.primaryProfile;
      secondary = combined.secondaryProfile;
      source = "combined";
    }
  }
  // Os dois existem mas um registro completo não veio: cai pra leitura do próprio aluno em vez de
  // esconder o cartão inteiro.
  if (!primary && (self || coach)) {
    const only = (self ?? coach)!;
    primary = only.primaryProfile;
    secondary = only.secondaryProfile;
    source = self ? "self" : "coach";
  }

  const coachUnseen =
    !!coach &&
    !!notifications?.some((n) => n.id === coachAssessmentNotificationId(coach.id) && !n.read);

  const open = () => navigate("/app/perfil-lutador");

  // Mais leve que os outros cartões da Home (só contorno, sem fundo, sombra nem ícone): é uma
  // informação de identidade, secundária ao saldo e à próxima aula — antes, em tela estreita, ele
  // ficava MAIS alto que o cartão da próxima aula.
  const cardClass =
    "mt-6 w-full text-left rounded-2xl border border-border p-4 active:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!primary) {
    return (
      <button type="button" onClick={open} className={cn(cardClass, "flex gap-3 items-center")}>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-foreground">Descubra seu estilo de lutador</div>
          <div className="text-sm text-muted-foreground mt-0.5">Questionário rápido, 14 perguntas</div>
        </div>
        <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" aria-hidden />
      </button>
    );
  }

  // Nome curto em inglês (a parte antes da barra — "Pressure Fighter / Swarmer" -> "Pressure
  // Fighter") + tradução embaixo. O nome completo continua na tela do Perfil de Boxe.
  const label = FIGHTER_PROFILE_LABELS[primary].split(" / ")[0];
  const gloss = FIGHTER_PROFILE_GLOSS_PT[primary];
  const secondaryGloss = secondary && secondary !== primary ? FIGHTER_PROFILE_GLOSS_PT[secondary] : null;

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Seu perfil de boxe: ${label}, ${gloss}${coachUnseen ? ". Seu professor te avaliou" : ""}. Ver perfil`}
      className={cardClass}
    >
      <div className="flex gap-3 items-center">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-muted-foreground">
            {source === "coach" ? "Seu estilo, na leitura do seu professor" : "Seu estilo de lutador"}
          </div>
          {/* Nome do arquétipo é o "número grande" deste cartão — por isso Bebas. */}
          <div className="font-display text-[22px] leading-tight tracking-wide text-foreground uppercase">{label}</div>
          <div className="text-sm text-muted-foreground">
            {gloss}
            {secondaryGloss && `, com traços de ${secondaryGloss}`}
          </div>
        </div>
        <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" aria-hidden />
      </div>
      {coachUnseen && (
        <div className="mt-3 pt-3 border-t border-border text-sm font-semibold text-amber">
          Seu professor te avaliou — veja a leitura dele
        </div>
      )}
    </button>
  );
}
