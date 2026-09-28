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
 * Quando `saldo` existe (pacote de recorrência), "crédito disponível"
 * (`available_credits_for_student`) não faz sentido — ver CLAUDE.md — então o headline vira
 * `saldo.restantes` ("aulas restantes"), não `credits`. Pra qualquer outra origem: `credits`,
 * "aulas para agendar".
 *
 * O card carrega o próprio estado (dourado com saldo, âmbar com 2 ou menos, neutro no zero) — o
 * número e a cor dizem a situação de relance, sem precisar de um alerta separado pra isso.
 * As marquinhas mostram o pacote aula a aula: usada (apagada), já agendada (contorno) e livre
 * (cheia) — antes era uma barra que crescia com as USADAS ao lado de um número que mostrava as
 * RESTANTES, duas leituras opostas no mesmo card.
 */
export function ActivePackageCard({ pkg, credits, saldo, hideAlert, audience = "admin" }: ActivePackageCardProps) {
  const headline = saldo ? saldo.restantes : credits;
  const tone: Tone = headline <= 0 ? "empty" : pkg && headline <= 2 ? "low" : "ok";
  const t = TONE[tone];
  // Sem pacote, "0" também é `<= 2` — o alerta dizia "restam poucas aulas, considere renovar" pra
  // quem nunca teve pacote. Só existe o que renovar quando existe pacote.
  const showLowAlert = !hideAlert && tone === "low";

  const unit = saldo
    ? plural(headline, "aula restante", "aulas restantes")
    : plural(headline, "aula para agendar", "aulas para agendar");

  // Recorrência: toda aula restante já nasce marcada, então "agendada" não distingue nada ali —
  // só usadas x restantes. Autosserviço: `credits` já desconta as reservas futuras; o que sobra
  // entre "restantes no pacote" e `credits` é o que está agendado. `credits` soma TODOS os pacotes
  // ativos (inclusive trial), por isso o clamp.
  const total = saldo ? saldo.total : (pkg?.totalClasses ?? 0);
  const used = saldo ? saldo.consumidas : (pkg?.usedClasses ?? 0);
  const remaining = Math.max(0, total - used);
  const free = saldo ? remaining : Math.min(Math.max(credits, 0), remaining);
  const booked = remaining - free;

  const summary = [
    saldo ? `${used} de ${total} ${plural(total, "feita", "feitas")}` : `${used} de ${total} ${plural(total, "usada", "usadas")}`,
    booked > 0 ? `${booked} já ${plural(booked, "agendada", "agendadas")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
        {pkg &&
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
          <div aria-hidden className="mt-4 mb-2.5">
            {total <= MAX_PIPS ? (
              <div className="flex gap-1">
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-2.5 flex-1 rounded-full",
                      i < used
                        ? "bg-secondary"
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
                {" "}
                · {saldo.aRepor} aguardando reposição
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pacote ativo</p>
      )}

      {showLowAlert && (
        <p className="mt-3 flex gap-2 items-center text-sm text-amber">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {saldo ? "Restam poucas aulas no pacote atual." : "Restam poucas aulas — considere renovar o pacote."}
        </p>
      )}
    </section>
  );
}
