import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, Check, ChevronRight, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ActivePackageCard } from "@/components/ActivePackageCard";
import { BoxingProfileHomeCard } from "@/components/BoxingProfileHomeCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acceptSuggestion, getModoAgendamentoEfetivo, getStudentAdminId, getStudentHome } from "@/integrations/backend/api";
import type { Booking } from "@/integrations/backend/types";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDayNumber, formatMonthShort, formatDate, formatDateShort, formatTime, formatWeekdayLong } from "@/lib/dateUtils";

export default function StudentHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student-home", profile?.id],
    queryFn: () => getStudentHome(profile!.id),
    enabled: !!profile,
  });

  // Aceitar a sugestão direto da Home (spec §12.2 item 3), sem o desvio pela tela da aula — mesma
  // função e mesmas invalidações que `student/AulaDetalhe.tsx` já usa.
  const accept = useMutation({
    mutationFn: (suggestion: Booking) => acceptSuggestion(suggestion.id),
    onSuccess: (_r, suggestion) => {
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      queryClient.invalidateQueries({ queryKey: ["student-history"] });
      toast.success(
        `Aula confirmada: ${formatDate(suggestion.suggestedStartTime!)} · ${formatTime(suggestion.suggestedStartTime!)}`,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível aceitar o novo horário."),
  });

  const { data: adminId, isError: adminIdError } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  // CLAUDE.md, Etapa 7 — CORRIGIDO 2026-09-08: o botão principal decide QUAL AÇÃO oferecer
  // (agendar sozinho x ver a agenda que o professor já montou), e isso é navegação — ramifica na
  // FLAG (modo_agendamento), não no dado de um pacote específico. Antes ramificava em
  // `recorrenciaSaldo` (existe saldo de recorrência NESTE pacote): um professor que ativa
  // RECORRENCIA mas cujo aluno ainda segura um pacote `purchase` antigo veria "Agendar aula" —
  // errado, porque `Agendar.tsx` já redireciona esse aluno pra fora mesmo assim.
  const { data: modoEfetivo, isError: modoError } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });
  const isRecorrencia = modoEfetivo === "recorrencia";
  // Sem esperar o modo, o botão nascia "Agendar aula" e virava "Ver minhas aulas" um instante
  // depois, na frente do aluno. Se uma das duas consultas falhar, cai no autosserviço (default
  // efetivo de `modo_agendamento_efetivo`) em vez de esconder o botão pra sempre.
  const modoPronto = modoEfetivo !== undefined || adminIdError || modoError;

  if (!profile) return null;

  // ActivePackageCard já resolve sozinho "crédito disponível" não fazer sentido em recorrência
  // (mostra saldo.restantes em vez de credits quando `saldo` existe) — isso aqui é só o dado que o
  // card precisa, não decide mais navegação.
  const saldo = data?.recorrenciaSaldo ?? null;

  // `credits` = aulas dos pacotes ativos MENOS as já reservadas no futuro, então "0" não quer
  // dizer "acabou": pode ser que tudo o que resta já esteja marcado, ou que o aluno nunca tenha
  // tido pacote. Cada caso tem sua própria frase — "Seu pacote acabou" pra todos era falso em dois
  // dos três.
  const pedido = !isRecorrencia ? (data?.pendingRequest ?? null) : null;
  // Aluno sem pacote e sem aula marcada (recém-convidado, ou esperando o professor gerar a
  // recorrência): no lugar de um "0" cinza + "Nenhum pacote ativo" + "Nenhuma aula agendada" — três
  // jeitos de dizer "nada" —, a Home explica o caminho até a primeira aula.
  const semPacote = !!data && !data.package && !data.nextBooking;
  const pedidoNome = pedido?.kind === "package" ? "pacote" : "aula avulsa";
  const cta = !data
    ? null
    : isRecorrencia && !data.nextBooking && !data.package
      ? // Recorrência sem pacote e sem aula: "Ver minhas aulas" levaria a uma lista vazia. O bloco
        // "Nenhuma aula agendada" logo acima já explica que o professor vai marcar.
        null
      : isRecorrencia
      ? {
          to: "/app/historico",
          label: "Ver minhas aulas",
          hint: data.nextBooking
            ? "Suas aulas já estão marcadas pelo professor"
            : "Seu professor marca as aulas por você",
        }
      : data.credits > 0
        ? {
            to: "/app/agendar",
            label: "Agendar aula",
            // Com uma sugestão de horário esperando resposta, ELA é a decisão da tela — o
            // "Agendar" vermelho competia com ela e caía pra baixo da barra de navegação.
            quiet: !!data.suggestion?.suggestedStartTime,
            hint: pedido
              ? `Seu pedido de ${pedidoNome} está com o professor`
              : "Escolha o dia e o horário da sua aula",
          }
        : pedido
          ? null
          : data.nextBooking
          ? {
              to: "/app/pacotes",
              label: "Solicitar mais aulas",
              hint: "Suas aulas restantes já estão agendadas",
              // Nada urgente aqui: o aluno tem aulas marcadas. Vermelho transformaria o pedido de
              // mais aulas em alarme.
              quiet: true,
            }
          : data.package
            ? { to: "/app/pacotes", label: "Solicitar novo pacote", hint: "As aulas do seu pacote acabaram" }
            : { to: "/app/pacotes", label: "Solicitar pacote", hint: "Escolha um pacote e seu professor libera as aulas" };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[13px] text-muted-foreground">Bom treino,</div>
          <h1 className="font-display text-[28px] leading-tight tracking-wide text-foreground uppercase">
            {profile.name}
          </h1>
        </div>
        <NotificationBell userId={profile.id} />
      </div>

      <PWAInstallBanner />

      {isLoading && (
        // Mesmo formato da tela pronta (cartão de saldo, rótulo, próxima aula, botão) — antes era só
        // o cartão, e o resto "pulava" pra dentro quando os dados chegavam.
        <div role="status" aria-label="Carregando seu painel">
          <SkeletonCard height={150} className="mb-4" />
          <SkeletonCard height={20} className="w-28 mt-2 mb-3" />
          <SkeletonCard height={88} className="mb-6" />
          <SkeletonCard height={56} />
        </div>
      )}
      {isError && <ErrorState title="Não foi possível carregar seu painel" onRetry={() => refetch()} />}

      {data && (
        <>
          <div className="mb-4 animate-bb-up">
            {!semPacote ? (
              <ActivePackageCard pkg={data.package} credits={data.credits} saldo={saldo} audience="student" />
            ) : !modoPronto ? (
              <SkeletonCard height={150} />
            ) : (
              <ComoFunciona recorrencia={isRecorrencia} pedidoEnviadoEm={pedido?.createdAt ?? null} pedidoNome={pedidoNome} />
            )}
          </div>

          {data.suggestion?.suggestedStartTime && (
            // Um botão só, na largura toda: com "Aceitar" e "Ver detalhes" lado a lado (sem quebra
            // de linha), os dois não cabiam em celulares de 360px e um saía do cartão. "Detalhes"
            // vira link no canto; o ícone saiu pra devolver largura e altura ao cartão.
            <section
              aria-label="Horário sugerido pelo professor"
              className="p-4 rounded-2xl bg-amber/10 border border-amber/30 mb-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[15px] font-semibold text-amber pt-0.5">Seu professor sugeriu outro horário</div>
                <button
                  type="button"
                  onClick={() => navigate(`/app/aula/${data.suggestion!.id}`)}
                  className="shrink-0 -mt-2.5 -mr-2 min-h-11 px-2 text-sm text-muted-foreground underline underline-offset-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Detalhes
                </button>
              </div>
              <div className="text-base font-semibold text-foreground first-letter:uppercase">
                {formatDate(data.suggestion.suggestedStartTime)} · {formatTime(data.suggestion.suggestedStartTime)}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                No lugar de {formatDateShort(data.suggestion.startTime)} · {formatTime(data.suggestion.startTime)}
              </div>
              <Button
                // Âmbar, não vermelho nem dourado: é a cor de "pendente, decida" do spec (§12.1).
                className="w-full h-12 mt-4 border-amber bg-amber text-amber-foreground hover:border-amber hover:brightness-110"
                variant="secondary"
                onClick={() => accept.mutate(data.suggestion!)}
                disabled={accept.isPending}
              >
                {accept.isPending ? "Confirmando…" : "Aceitar horário"}
              </Button>
            </section>
          )}

          {!semPacote && <h2 className="section-title mt-2 mb-3">Próxima aula</h2>}
          {semPacote ? null : data.nextBooking ? (
            <button
              type="button"
              onClick={() => navigate(`/app/aula/${data.nextBooking!.id}`)}
              aria-label={`${formatDate(data.nextBooking.startTime)}, ${formatTime(data.nextBooking.startTime)}, ${getStatusConfig(data.nextBooking.status).label}. Ver detalhes`}
              className="w-full text-left card-dark p-4 flex gap-4 items-center mb-6 active:scale-[0.98] active:bg-secondary transition-[transform,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div aria-hidden className="w-[54px] text-center border-r border-border pr-3">
                <div className="font-display text-3xl leading-none text-foreground">
                  {formatDayNumber(data.nextBooking.startTime)}
                </div>
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  {formatMonthShort(data.nextBooking.startTime)}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-base font-semibold text-foreground mb-1">
                  {formatWeekdayLong(data.nextBooking.startTime)} · {formatTime(data.nextBooking.startTime)}
                </div>
                <Badge className={getStatusConfig(data.nextBooking.status).badgeClass}>
                  {getStatusConfig(data.nextBooking.status).label}
                </Badge>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center mb-6">
              <div className="text-[15px] text-foreground/85 mb-1">Nenhuma aula agendada</div>
              <div className="text-sm text-muted-foreground">
                {!modoPronto
                  ? " "
                  : isRecorrencia
                    ? "Seu professor ainda não marcou suas próximas aulas."
                    : data.credits > 0
                      ? "Escolha um horário livre do professor."
                      : // Sem aulas, o cartão e o botão logo abaixo já dizem isso e o que fazer.
                        null}
              </div>
            </div>
          )}

          {!modoPronto ? (
            <SkeletonCard height={56} />
          ) : cta ? (
            <>
              {/* Sem pulso: um brilho pulsando pra sempre dizia "urgente" a cada visita, até pra
                  "Ver minhas aulas", e disputava atenção com o saldo — que é o dado principal da
                  tela. Na recorrência o botão é secundário: a aula já está marcada logo acima, o
                  botão só leva à lista. */}
              <Button
                size="lg"
                variant={isRecorrencia || ("quiet" in cta && cta.quiet) ? "secondary" : "default"}
                className="w-full h-14"
                onClick={() => navigate(cta.to)}
              >
                <Calendar className="h-[19px] w-[19px]" aria-hidden />
                {cta.label}
              </Button>
              {/* Sem pacote, o "Como funciona" logo acima já explica o que acontece depois. */}
              {!semPacote && <div className="text-center text-sm text-muted-foreground mt-3">{cta.hint}</div>}
            </>
          ) : pedido && !semPacote ? (
            // Sem aulas e com pedido em espera: não há nada a fazer além de aguardar, então não há
            // botão — um "Solicitar" aqui convidaria a pedir de novo o que já foi pedido.
            <div role="status" className="flex gap-3 items-start p-4 rounded-2xl bg-amber/10 border border-amber/30">
              <Hourglass className="h-5 w-5 text-amber shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-[15px] font-semibold text-foreground">
                  Pedido de {pedidoNome} enviado
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Assim que o professor aprovar, suas aulas aparecem aqui. Enviado em{" "}
                  {formatDateShort(pedido.createdAt)}.
                </div>
              </div>
            </div>
          ) : null}

          <BoxingProfileHomeCard />
        </>
      )}
    </div>
  );
}

/**
 * "Como funciona" — ocupa o lugar do cartão de saldo enquanto o aluno não tem pacote. Mostra em
 * qual passo ele está (pedido enviado = passo 2 em andamento), em vez de só listar os passos.
 */
function ComoFunciona({
  recorrencia,
  pedidoEnviadoEm,
  pedidoNome,
}: {
  recorrencia: boolean;
  pedidoEnviadoEm: string | null;
  pedidoNome: string;
}) {
  if (recorrencia) {
    return (
      <section aria-label="Sua agenda" className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">Seu professor está montando sua agenda</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ele define seus dias fixos e gera as aulas do pacote. Assim que isso acontecer, elas aparecem aqui —
          você não precisa agendar nada.
        </p>
      </section>
    );
  }

  const passos: { titulo: string; detalhe?: string; estado: "feito" | "atual" | "depois" }[] = [
    {
      titulo: pedidoEnviadoEm ? `Pedido de ${pedidoNome} enviado` : "Escolha um pacote de aulas",
      detalhe: pedidoEnviadoEm ? `Em ${formatDateShort(pedidoEnviadoEm)}` : undefined,
      estado: pedidoEnviadoEm ? "feito" : "atual",
    },
    {
      titulo: "Seu professor aprova e libera as aulas",
      detalhe: pedidoEnviadoEm ? "Aguardando o professor" : undefined,
      estado: pedidoEnviadoEm ? "atual" : "depois",
    },
    { titulo: "Agende o dia e o horário que preferir", estado: "depois" },
  ];

  return (
    <section aria-label="Como funciona" className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold text-foreground">Suas aulas começam em 3 passos</h2>
      <ol className="mt-4 flex flex-col gap-3">
        {passos.map((p, i) => (
          <li
            key={p.titulo}
            className="flex gap-3 items-start"
            aria-current={p.estado === "atual" ? "step" : undefined}
          >
            <span
              aria-hidden
              className={cn(
                "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold border",
                p.estado === "feito" && "border-transparent bg-secondary text-foreground",
                p.estado === "atual" && (pedidoEnviadoEm ? "border-amber text-amber" : "border-foreground text-foreground"),
                p.estado === "depois" && "border-border text-muted-foreground",
              )}
            >
              {p.estado === "feito" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="pt-0.5">
              <div
                className={cn(
                  "text-[15px]",
                  p.estado === "depois" ? "text-muted-foreground" : "font-semibold text-foreground",
                )}
              >
                {p.titulo}
              </div>
              {p.detalhe && (
                <div className={cn("text-sm", p.estado === "atual" ? "text-amber" : "text-muted-foreground")}>
                  {p.detalhe}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
