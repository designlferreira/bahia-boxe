import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PackageRecord, SaldoPacote } from "@/integrations/backend/types";

const ORIGIN_LABEL: Record<PackageRecord["origin"], string> = {
  trial: "Experimental",
  purchase: "Compra",
  admin_grant: "Concedido",
  recurrence: "Recorrência",
};

/** Acima disso uma marquinha por aula fica fina demais pra ler — cai pra uma barra contínua. */
const MAX_PIPS = 20;

interface ActivePackageCardProps {
  pkg: PackageRecord | null;
  credits: number;
  /**
   * Saldo derivado da cadeia (CLAUDE.md, decisão 4/8) — só existe pra pacotes de recorrência.
   * Passe `undefined`/`null` pra qualquer outra origem; o card não busca isso sozinho, quem chama
   * decide quando vale a pena consultar `saldo_pacotes`.
   */
  saldo?: SaldoPacote | null;
  /** Esconde o alerta de "poucas aulas" — nenhum lugar precisa disso hoje, existe por simetria. */
  hideAlert?: boolean;
  /**
   * Quem está olhando. O selo de origem (Compra/Concedido/Recorrência) é informação de gestão —
   * útil pro professor, ruído pro aluno, que no lugar dele vê o nome do pacote.
   */
  audience?: "admin" | "student";
  /**
   * Quando existe, o alerta de poucas aulas ganha o link "Pedir mais aulas". Quem chama decide:
   * só faz sentido pro aluno que pede pacote sozinho (autosserviço) — na recorrência quem gera o
   * pacote é o professor, e o professor não pede pacote pra si.
   */
  onRequestMore?: () => void;
  /** Botões do próprio pacote (professor: atribuir novo / encerrar) — dentro do cartão, porque agem SOBRE ele. */
  actions?: ReactNode;
  /**
   * Professor: pra onde "Marcar aula" leva quando sobra aula sem data. Só a tela que não é ela
   * mesma passa isto (em Horários fixos o botão apontaria pra onde o professor já está).
   */
  marcarAulaTo?: string;
}

type Tone = "ok" | "low" | "empty";

const TONE = {
  ok: {
    card: "border-accent/25 bg-[linear-gradient(150deg,hsl(var(--accent)/0.09),hsl(var(--card))_60%)]",
    number: "text-accent",
    fill: "bg-accent",
    booked: "border-accent/70",
  },
  low: {
    card: "border-amber/35 bg-[linear-gradient(150deg,hsl(var(--amber)/0.10),hsl(var(--card))_60%)]",
    number: "text-amber",
    fill: "bg-amber",
    booked: "border-amber/70",
  },
  empty: {
    card: "border-border bg-card",
    number: "text-muted-foreground",
    fill: "bg-muted-foreground",
    booked: "border-muted-foreground",
  },
} as const;

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/**
 * Card único de "pacote ativo" — uma linha de `packages`, seja qual for a origem (decisão do
 * CLAUDE.md, 2026-09-08: recorrência não é uma entidade paralela, é só mais um `packages` com
 * `origin = 'recurrence'`). Usado por `AlunoDetalhe.tsx`, `AlunoRecorrencia.tsx` E
 * `student/Home.tsx` — MESMA instância nos três lugares, não versões paralelas do mesmo conceito
 * (a duplicação em `Home.tsx`, achada em teste em 2026-09-08, era exatamente essa: uma versão
 * própria, nunca migrada pra cá quando este componente foi criado).
 *
 * O número grande responde "quantas aulas me restam no pacote" (total − usadas), nos dois fluxos.
 * Antes, no autosserviço, ele mostrava `credits` — restantes MENOS as já agendadas —, então um
 * aluno com 2 aulas restantes e as 2 marcadas via um "0" cinza, lido como "acabou", com duas
 * aulas no calendário. "Quantas ainda posso agendar" desceu pra frase-resumo e pras marquinhas.
 * Na recorrência a fonte é `saldo` (`saldo_pacotes`, a autoridade — CLAUDE.md decisão 4), nunca
 * o `used_classes` materializado.
 *
 * O card carrega o próprio estado (dourado com saldo, âmbar com 2 ou menos, neutro no zero) — o
 * número e a cor dizem a situação de relance, sem precisar de um alerta separado pra isso.
 * As marquinhas mostram o pacote aula a aula: usada (apagada), já agendada (contorno) e livre
 * (cheia).
 */
export function ActivePackageCard({
  pkg,
  credits,
  saldo,
  hideAlert,
  audience = "admin",
  onRequestMore,
  actions,
  marcarAulaTo,
}: ActivePackageCardProps) {
  // Autosserviço: `credits` soma TODOS os pacotes ativos (inclusive trial) e já desconta as
  // reservas futuras; o que sobra entre "restantes no pacote" e `credits` é o que está agendado —
  // por isso o clamp. Recorrência: toda aula restante já nasce marcada, então "agendada" não
  // distingue nada ali — só usadas x restantes.
  const total = saldo ? saldo.total : (pkg?.totalClasses ?? 0);
  const used = saldo ? saldo.consumidas : (pkg?.usedClasses ?? 0);
  // Pacote encerrado não tem aula restante, mesmo que `used < total` (o professor pode ter
  // removido o pacote antes do fim) — o que sobrou não está mais disponível.
  const remaining = pkg?.status === "finished" ? 0 : Math.max(0, total - used);
  const free = saldo ? remaining : Math.min(Math.max(credits, 0), remaining);
  const booked = remaining - free;

  // Sem pacote não há "restantes" — mostra o crédito solto que houver (normalmente 0).
  const headline = pkg || saldo ? remaining : Math.max(credits, 0);
  // Aula experimental é presente de boas-vindas, não "pacote acabando": fica no dourado (crédito),
  // nunca no âmbar de "poucas aulas" — que pegava toda experimental, já que 1 é <= 2. É a primeira
  // tela de quase todo aluno novo (`grant_trial_credit`).
  const isTrial = pkg?.origin === "trial";
  const tone: Tone = headline <= 0 ? "empty" : pkg && !isTrial && headline <= 2 ? "low" : "ok";
  const t = TONE[tone];
  // Só existe o que renovar quando existe pacote; aula experimental não se "renova". Pro aluno, o
  // alerta só aparece quando leva a algum lugar (link "Pedir mais aulas") ou é recorrência (aviso
  // de que o pacote gerado pelo professor está no fim). Quando o botão principal da Home já é o
  // pedido, o tom âmbar do cartão basta — o alerta seria a terceira vez dizendo a mesma coisa.
  const showLowAlert =
    !hideAlert && tone === "low" && !isTrial && (audience === "admin" || !!onRequestMore || !!saldo);

  // Uma palavra só pro mesmo número, com ou sem pacote, nos dois fluxos — antes alternava entre
  // "restantes" e "disponíveis" e o aluno podia achar que eram coisas diferentes.
  const unit = isTrial
    ? plural(headline, "aula experimental", "aulas experimentais")
    : plural(headline, "aula restante", "aulas restantes");

  // Professor: o razão completo (usadas · agendadas · para agendar) — é informação de gestão.
  const adminSummary = [
    // "usadas" nos dois fluxos. Na recorrência era "feitas", o que além de inconsistente era impreciso:
    // `consumidas` inclui falta que consumiu crédito, e uma falta não é uma aula "feita".
    `${used} de ${total} ${plural(total, "usada", "usadas")}`,
    booked > 0 ? `${booked} ${plural(booked, "agendada", "agendadas")}` : null,
    // Só vale dizer "para agendar" quando há as duas coisas; sem agendadas, o número grande já diz.
    booked > 0 && free > 0 ? `${free} para agendar` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Aluno: uma resposta só. Com "7 aulas restantes" em cima, "3 de 10 usadas · 1 agendada · 6 para
  // agendar" embaixo obrigava a conciliar dois números de "quanto sobra" (7 e 6). O aluno só
  // precisa saber o que ainda dá pra agendar — e só quando isso é diferente do número grande.
  const studentSummary = isTrial
    ? headline > 0
      ? "Cortesia pra você conhecer o treino. Agende quando quiser."
      : null
    : pkg?.status === "finished"
      ? `Pacote de ${total} ${plural(total, "aula", "aulas")} concluído`
      : booked > 0 && free > 0
        ? `${free} ${plural(free, "livre", "livres")} para agendar · ${booked} já ${plural(booked, "agendada", "agendadas")}`
        : booked > 0
          ? plural(booked, "Já está agendada", "Todas já estão agendadas")
          : null;
  const summary = audience === "student" ? studentSummary : adminSummary;
  // Aula restante que ninguém marcou (ex.: o professor cancelou uma): sem este aviso o cartão diz
  // "1 aula restante" e não há aula nenhuma na agenda.
  const semData = pkg?.status === "finished" ? 0 : (saldo?.semData ?? 0);

  return (
    <section
      aria-label="Saldo de aulas"
      className={cn("rounded-2xl border p-4 transition-colors duration-300", t.card)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-baseline gap-2 min-w-0">
          <span className={cn("font-display text-[56px] leading-[0.85] tabular-nums", t.number)}>{headline}</span>
          <span className="text-[15px] font-medium text-foreground/85">{unit}</span>
        </p>
        {/* Na experimental o aluno já lê "aula experimental" ao lado do número — o nome seria repetição. */}
        {pkg &&
          !(isTrial && audience === "student") &&
          (audience === "admin" ? (
            <Badge className="bg-accent/15 text-accent shrink-0">{ORIGIN_LABEL[pkg.origin]}</Badge>
          ) : (
            <span className="text-[13px] text-muted-foreground text-right truncate max-w-[45%] pt-1">
              {pkg.templateName}
            </span>
          ))}
      </div>

      {pkg && total > 0 ? (
        <>
          <div aria-hidden className="mt-4 mb-3">
            {total <= MAX_PIPS ? (
              <div className="flex gap-1">
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 flex-1 rounded-full",
                      // Usada: apagada, mas visível (~3:1 sobre o card). Antes era bg-secondary, ~1,2:1 —
                      // sumia, e o medidor dependia só da frase pequena.
                      i < used
                        ? "bg-muted-foreground/60"
                        : i < used + booked
                          ? cn("border-2 bg-transparent", t.booked)
                          : t.fill,
                    )}
                  />
                ))}
              </div>
            ) : (
              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                <div className={cn("h-full rounded-full", t.fill)} style={{ width: `${(remaining / total) * 100}%` }} />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {summary}
            {saldo && saldo.aRepor > 0 && (
              <span className="text-amber">
                {summary ? " · " : ""}
                {audience === "student"
                  ? // "Reposição" é vocabulário de quem gerencia; pro aluno, o que importa é que
                    // há aula a remarcar e que isso passa pelo professor.
                    `${saldo.aRepor} para remarcar com o professor`
                  : `${saldo.aRepor} aguardando reposição`}
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pacote ativo</p>
      )}

      {semData > 0 && (
        <div className="mt-3 flex gap-2 items-center justify-between text-sm text-amber">
          <p className="flex gap-2 items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {audience === "student"
              ? `${plural(semData, "Falta 1 aula", `Faltam ${semData} aulas`)} para o seu professor marcar.`
              : `${semData} ${plural(semData, "aula sem data marcada", "aulas sem data marcada")}.`}
          </p>
          {audience === "admin" && marcarAulaTo && (
            <Link
              to={marcarAulaTo}
              className="shrink-0 -my-2.5 -mr-2 inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Marcar aula
            </Link>
          )}
        </div>
      )}

      {showLowAlert && (
        <div className="mt-3 flex gap-2 items-center justify-between text-sm text-amber">
          <p className="flex gap-2 items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {onRequestMore
              ? "Restam poucas aulas."
              : saldo
                ? "Restam poucas aulas no pacote atual."
                : // Só o professor chega aqui (ver showLowAlert).
                  "Restam poucas aulas — considere renovar o pacote."}
          </p>
          {onRequestMore && (
            // Antes o alerta mandava "renovar" sem caminho nenhum: o aluno não tem aba de Pacotes,
            // e o botão principal só levava lá com zero aulas.
            <button
              type="button"
              onClick={onRequestMore}
              className="shrink-0 -my-2.5 -mr-2 min-h-11 px-2 font-semibold underline underline-offset-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Pedir mais aulas
            </button>
          )}
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap gap-2.5">{actions}</div>}
    </section>
  );
}
