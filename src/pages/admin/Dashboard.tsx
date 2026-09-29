import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateShort, formatRelativeDay, formatTime } from "@/lib/dateUtils";
import { getAdminDashboard, type PrimeirosPassos } from "@/integrations/backend/api";
import { getStatusConfig } from "@/lib/bookingStatus";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { usePendingActions } from "@/hooks/usePendingActions";
import { useLessonActions } from "@/hooks/useLessonActions";
import type { Booking } from "@/integrations/backend/types";

type AulaComNome = Booking & { studentName: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const t = (iso: string) => new Date(iso).getTime();

/** "Amanhã, 07:00" / "Terça, 06 out · 07:00" — além de amanhã o dia da semana sozinho é ambíguo. */
function quando(iso: string) {
  const dia = formatRelativeDay(iso);
  if (dia === "Hoje" || dia === "Amanhã") return `${dia}, ${formatTime(iso)}`;
  return `${dia}, ${formatDateShort(iso)} · ${formatTime(iso)}`;
}

/** "em 40 min" / "em 2 h 15 min". Longe demais, o horário grande já basta. */
function contagem(inicio: string, agora: number) {
  const min = Math.max(1, Math.ceil((t(inicio) - agora) / 60_000));
  if (min < 60) return `em ${min} min`;
  if (min >= 180) return null;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `em ${h} h ${r} min` : `em ${h} h`;
}

/** Relógio que anda de minuto em minuto — a contagem "em 40 min" não pode congelar. */
function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const agora = useAgora();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-dashboard", profile?.id],
    queryFn: () => getAdminDashboard(profile!.id),
    enabled: !!profile,
  });

  // Aprovar/recusar: mesmo hook da Agenda (trava durante o envio, desfazer, remarcação com de -> para).
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
    queryClient.invalidateQueries({ queryKey: ["awaiting-confirmation-bookings"] });
  };
  const pendentes = usePendingActions(profile?.id ?? "", invalidate);
  // Aconteceu/Faltou: o mesmo hook da Agenda e do detalhe da aula (confirmação + desfazer no aviso).
  const aulas = useLessonActions(invalidate);

  if (!profile) return null;

  const semAlunos = data?.activeStudents === 0;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[13px] text-muted-foreground">{formatDate(new Date())}</div>
          <h1 className="font-display text-[28px] leading-tight tracking-wide text-foreground uppercase">
            Prof. {profile.name.split(" ")[0]}
          </h1>
        </div>
        <NotificationBell userId={profile.id} />
      </div>

      {isError && <ErrorState title="Não foi possível carregar o painel" onRetry={() => refetch()} />}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard height={280} className="rounded-[20px]" />
          <SkeletonCard height={120} className="rounded-[20px]" />
        </div>
      )}

      {data && (
        <>
          {/* O dia primeiro (decisão do Lucas, 2026-09-28): é o que o professor abre o app pra ver.
              As pendências vêm logo abaixo, ainda à vista sem rolar na maioria dos dias. */}
          <div className="flex flex-col gap-4 mb-6">
            {semAlunos && data.primeirosPassos ? (
              <ComecePorAqui passos={data.primeirosPassos} />
            ) : (
              <Hoje today={data.today} nextAfterToday={data.nextAfterToday} agora={agora} />
            )}

            <ResolverAgora
              pending={data.pending}
              awaiting={data.awaitingConfirmation}
              purchaseRequests={data.purchaseRequests}
              pendentes={pendentes}
              aulas={aulas}
            />
          </div>

          {!semAlunos && (
            <section aria-labelledby="em-risco">
              <h2 id="em-risco" className="section-title mb-1">
                Alunos em risco
              </h2>
              <div className="text-sm text-muted-foreground mb-3">Pacote acabando ou faltas seguidas.</div>
              <div className="flex flex-col gap-2.5">
                {data.atRisk.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhum aluno em risco no momento.</div>
                )}
                {/* No máximo 3 aqui: com muitos alunos a lista empurrava o resto do painel pra baixo. */}
                {data.atRisk.slice(0, 3).map(({ student, motivo, grave }) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => navigate(`/admin/alunos/${student.id}`)}
                    className="w-full text-left card-dark p-3.5 flex items-center gap-3 active:scale-[0.985] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      aria-hidden
                      className="h-[38px] w-[38px] rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold text-foreground/80"
                    >
                      {student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-foreground">{student.name}</div>
                      <div className={`text-sm ${grave ? "text-[hsl(var(--red-text))]" : "text-amber"}`}>{motivo}</div>
                    </div>
                    <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
                  </button>
                ))}
                {data.atRisk.length > 3 && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin/alunos?filtro=risco")}
                    className="min-h-11 text-sm font-semibold text-foreground underline underline-offset-4 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ver todos ({data.atRisk.length})
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {pendentes.dialogs}
      {aulas.dialogs}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolver agora — tudo que depende do professor, num quadro só (antes: dois blocos de cores
// diferentes, e pedido de aulas nem aparecia no painel).
// ---------------------------------------------------------------------------

type Pendente = AulaComNome & { antecessorInicio: string | null };

function ResolverAgora({
  pending,
  awaiting,
  purchaseRequests,
  pendentes,
  aulas,
}: {
  pending: Pendente[];
  awaiting: AulaComNome[];
  purchaseRequests: number;
  pendentes: ReturnType<typeof usePendingActions>;
  aulas: ReturnType<typeof useLessonActions>;
}) {
  const navigate = useNavigate();
  if (pending.length === 0 && awaiting.length === 0 && purchaseRequests === 0) return null;

  const remarcacoes = pending.filter((b) => b.antecessorInicio).length;
  const novos = pending.length - remarcacoes;
  const resumoPedidos =
    pending.length === 1
      ? `${pending[0].studentName.split(" ")[0]} · ${quando(pending[0].startTime)}`
      : [remarcacoes && plural(remarcacoes, "remarcação", "remarcações"), novos && plural(novos, "novo horário", "novos horários")]
          .filter(Boolean)
          .join(" · ");
  const resumoSemRegistro =
    awaiting.length === 1
      ? `${awaiting[0].studentName.split(" ")[0]} · ${quando(awaiting[0].startTime)}`
      : "Diga se aconteceram ou se o aluno faltou";

  return (
    <section aria-labelledby="resolver" className="rounded-[20px] bg-card border border-amber/40 px-4 pt-3.5 pb-1 animate-bb-up">
      <h2 id="resolver" className="section-title !text-amber mb-1">
        Resolver agora
      </h2>

      {pending.length > 0 && (
        <Grupo id="pedidos-pendentes" titulo={plural(pending.length, "pedido de horário", "pedidos de horário")} resumo={resumoPedidos}>
          {pending.map((b) => (
            <ItemResolver
              key={b.id}
              nome={b.studentName}
              etiqueta={b.antecessorInicio ? "Remarcação" : "Novo horário"}
              horario={
                b.antecessorInicio ? (
                  // Pedido de remarcação: de onde pra onde — sem isso o professor precisava lembrar qual
                  // aula estava sendo movida.
                  <>
                    <span className="sr-only">de </span>
                    <span className="line-through">{quando(b.antecessorInicio)}</span>
                    <span aria-hidden> → </span>
                    <span className="sr-only">para </span>
                    <span className="text-foreground">{quando(b.startTime)}</span>
                  </>
                ) : (
                  `${quando(b.startTime)} – ${formatTime(b.endTime)}`
                )
              }
              quando={quando(b.startTime)}
              busy={pendentes.isBusy(b.id)}
              primario={{ label: "Aprovar", onClick: () => pendentes.requestApprove(b) }}
              secundario={{ label: "Recusar", onClick: () => pendentes.requestReject(b) }}
            />
          ))}
        </Grupo>
      )}

      {awaiting.length > 0 && (
        <Grupo
          id="aulas-sem-registro"
          titulo={plural(awaiting.length, "aula sem registro", "aulas sem registro")}
          resumo={resumoSemRegistro}
          borda={pending.length > 0}
        >
          {/* Já vem da mais antiga pra mais nova — a mais antiga é a que mais corre risco de ser esquecida. */}
          {awaiting.map((b) => (
            <ItemResolver
              key={b.id}
              nome={b.studentName}
              horario={quando(b.startTime)}
              quando={quando(b.startTime)}
              busy={aulas.isBusy(b.id)}
              primario={{ label: "Aconteceu", onClick: () => aulas.openComplete(b, b.studentName) }}
              secundario={{ label: "Faltou", onClick: () => aulas.openNoShow(b, b.studentName) }}
            />
          ))}
        </Grupo>
      )}

      {purchaseRequests > 0 && (
        <button
          type="button"
          onClick={() => navigate("/admin/solicitacoes")}
          className={cn(
            "w-full text-left min-h-11 py-3 flex items-center gap-3 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
            (pending.length > 0 || awaiting.length > 0) && "border-t border-border rounded-none",
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-foreground">
              {plural(purchaseRequests, "pedido de aulas", "pedidos de aulas")}
            </div>
            <div className="text-sm text-muted-foreground">Aprovar libera as aulas para o aluno</div>
          </div>
          <ChevronRight className="h-[18px] w-[18px] text-muted-foreground shrink-0" aria-hidden />
        </button>
      )}
    </section>
  );
}

/**
 * Uma linha que se abre no próprio painel. Recolhida por padrão: aberta, cada item ocupa ~130px e a
 * agenda do dia (o destaque) ia pra baixo da dobra justo no dia mais cheio. Lembra, na sessão, se o
 * professor deixou aberto — ir pra agenda e voltar não fecha o que ele estava resolvendo.
 */
function Grupo({
  id,
  titulo,
  resumo,
  borda = false,
  children,
}: {
  id: string;
  titulo: string;
  resumo: string;
  borda?: boolean;
  children: ReactNode;
}) {
  const chave = `painel.grupo.${id}`;
  const [aberto, setAbertoState] = useState(() => {
    try {
      return sessionStorage.getItem(chave) === "1";
    } catch {
      return false;
    }
  });
  const setAberto = (f: (v: boolean) => boolean) =>
    setAbertoState((v) => {
      const novo = f(v);
      try {
        sessionStorage.setItem(chave, novo ? "1" : "0");
      } catch {
        /* sem armazenamento: só não lembra */
      }
      return novo;
    });
  return (
    <div className={cn(borda && "border-t border-border")}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className="w-full text-left min-h-11 py-3 flex items-center gap-3 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-foreground">{titulo}</div>
          <div className="text-sm text-muted-foreground">{resumo}</div>
        </div>
        <ChevronDown
          className={cn("h-[18px] w-[18px] text-muted-foreground shrink-0 transition-transform", aberto && "rotate-180")}
          aria-hidden
        />
      </button>
      <div id={id} hidden={!aberto}>
        {children}
      </div>
    </div>
  );
}

function ItemResolver({
  nome,
  etiqueta,
  horario,
  quando,
  busy,
  primario,
  secundario,
}: {
  nome: string;
  etiqueta?: string;
  horario: ReactNode;
  /** Pro nome acessível dos botões ("Aprovar: Ana, terça 07:00") — senão são N botões "Aprovar" iguais. */
  quando: string;
  busy: boolean;
  primario: { label: string; onClick: () => void };
  secundario: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-3 border-t border-border">
      <div className="flex justify-between items-start gap-3 mb-2.5">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-foreground">{nome}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{horario}</div>
        </div>
        {etiqueta && <span className="shrink-0 text-xs text-amber pt-1">{etiqueta}</span>}
      </div>
      <div className="flex gap-2">
        <Button
          variant="soft"
          size="sm"
          className="flex-1"
          onClick={primario.onClick}
          disabled={busy}
          aria-label={`${primario.label}: ${nome}, ${quando}`}
        >
          {primario.label}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={secundario.onClick}
          disabled={busy}
          aria-label={`${secundario.label}: ${nome}, ${quando}`}
        >
          {secundario.label}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hoje — o destaque do painel (spec: a agenda do dia é o que o professor abre o app pra ver).
// ---------------------------------------------------------------------------

function Hoje({ today, nextAfterToday, agora }: { today: AulaComNome[]; nextAfterToday: AulaComNome | null; agora: number }) {
  const navigate = useNavigate();

  // Destaque: a aula em andamento; senão, a próxima de hoje.
  const emAndamento = today.find((b) => b.status === "scheduled" && t(b.startTime) <= agora && agora < t(b.endTime));
  const proxima = emAndamento ?? today.find((b) => t(b.startTime) > agora);
  const resto = today.filter((b) => b.id !== proxima?.id);
  const registradas = today.filter((b) => b.status === "completed" || b.status === "no_show").length;

  let rotulo = "";
  if (proxima) {
    if (emAndamento) rotulo = `Agora · até ${formatTime(proxima.endTime)}`;
    else {
      const c = contagem(proxima.startTime, agora);
      rotulo = c ? `Próxima · ${c}` : "Próxima";
    }
  }

  return (
    <section aria-labelledby="hoje" className="card-dark rounded-[20px] p-4">
      <div className="flex justify-between items-baseline gap-3">
        <h2 id="hoje" className="section-title">
          {today.length ? `Hoje · ${plural(today.length, "aula", "aulas")}` : "Hoje"}
        </h2>
        {registradas > 0 && (
          <span className="text-sm text-muted-foreground">{plural(registradas, "registrada", "registradas")}</span>
        )}
      </div>

      {today.length === 0 && (
        <>
          <div className="font-display text-[34px] leading-tight tracking-wide text-foreground uppercase mt-1">Dia livre</div>
          <div className="text-sm text-muted-foreground">Nenhuma aula marcada hoje.</div>
        </>
      )}

      {proxima && (
        <button
          type="button"
          onClick={() => navigate(`/admin/aula/${proxima.id}`)}
          className="w-full text-left mt-3 rounded-2xl bg-primary/10 p-3.5 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="text-[13px] font-semibold text-[hsl(var(--red-text))]">{rotulo}</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-[44px] leading-none text-foreground">{formatTime(proxima.startTime)}</span>
            <span className="text-[16px] font-semibold text-foreground">{proxima.studentName}</span>
          </div>
          {proxima.status === "pending_confirmation" && (
            <div className="text-sm text-amber mt-1">Aguardando sua aprovação</div>
          )}
        </button>
      )}

      {resto.length > 0 && (
        <ul className="mt-2">
          {resto.map((b) => {
            const passou = t(b.endTime) <= agora;
            // "Agendada" num horário que já passou engana: falta o professor registrar.
            const semRegistro = b.status === "scheduled" && passou;
            const cfg = getStatusConfig(b.status);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/aula/${b.id}`)}
                  className="w-full text-left min-h-11 py-2 flex items-center gap-3 border-b border-border last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                  <span className={cn("font-display text-xl w-[52px] shrink-0", passou ? "text-muted-foreground" : "text-foreground")}>
                    {formatTime(b.startTime)}
                  </span>
                  <span className={cn("flex-1 min-w-0 text-[15px] truncate", passou ? "text-muted-foreground" : "text-foreground font-semibold")}>
                    {b.studentName}
                  </span>
                  {semRegistro ? (
                    <Badge className="bg-amber/20 text-amber">Sem registro</Badge>
                  ) : (
                    <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Nada mais hoje: diz quando é a próxima, em vez de deixar o professor abrir a agenda pra saber. */}
      {!proxima && (
        <div className="mt-3 rounded-xl bg-secondary px-3.5 py-3">
          <div className="text-[13px] text-muted-foreground">Próxima aula</div>
          <div className="text-[15px] text-foreground">
            {nextAfterToday ? `${quando(nextAfterToday.startTime)} · ${nextAfterToday.studentName}` : "Nenhuma aula marcada nos próximos dias."}
          </div>
        </div>
      )}

      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={() => navigate("/admin/agenda")}
          className="min-h-11 px-2 -mr-2 flex items-center gap-1 text-sm text-muted-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Agenda completa
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comece por aqui — professor sem aluno nenhum. Cada passo se marca sozinho quando é feito.
// ---------------------------------------------------------------------------

function ComecePorAqui({ passos }: { passos: PrimeirosPassos }) {
  const navigate = useNavigate();
  const itens = [
    { feito: passos.horarios, titulo: "Publicar seus horários", rota: "/admin/disponibilidade" },
    { feito: passos.pacotes, titulo: "Criar um pacote de aulas", rota: "/admin/pacotes" },
    { feito: passos.whatsapp, titulo: "Cadastrar seu WhatsApp", rota: "/admin/configuracoes" },
    { feito: false, titulo: "Convidar o primeiro aluno", rota: "/admin/alunos" },
  ];
  return (
    <section aria-labelledby="comece" className="card-dark rounded-[20px] p-4">
      <h2 id="comece" className="font-display text-[28px] leading-tight tracking-wide text-foreground uppercase">
        Comece por aqui
      </h2>
      <div className="text-sm text-muted-foreground mb-2">Quatro passos para receber o primeiro aluno.</div>
      <ol>
        {itens.map((p) => (
          <li key={p.rota} className="border-t border-border">
            {p.feito ? (
              <div className="min-h-11 py-2.5 flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-accent shrink-0" aria-hidden />
                <span className="line-through">{p.titulo}</span>
                <span className="sr-only">(feito)</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate(p.rota)}
                className="w-full text-left min-h-11 py-2.5 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                <span className="flex-1 text-[15px] font-semibold text-foreground">{p.titulo}</span>
                <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
