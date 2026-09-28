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
export function ActivePackageCard({ pkg, credits, saldo, hideAlert, audience = "admin" }: ActivePackageCardProps) {
  // Autosserviço: `credits` soma TODOS os pacotes ativos (inclusive trial) e já desconta as
  // reservas futuras; o que sobra entre "restantes no pacote" e `credits` é o que está agendado —
  // por isso o clamp. Recorrência: toda aula restante já nasce marcada, então "agendada" não
  // distingue nada ali — só feitas x restantes.
  const total = saldo ? saldo.total : (pkg?.totalClasses ?? 0);
  const used = saldo ? saldo.consumidas : (pkg?.usedClasses ?? 0);
  const remaining = Math.max(0, total - used);
  const free = saldo ? remaining : Math.min(Math.max(credits, 0), remaining);
  const booked = remaining - free;

  // Sem pacote não há "restantes" — mostra o crédito solto que houver (normalmente 0).
  const headline = pkg || saldo ? remaining : Math.max(credits, 0);
  const tone: Tone = headline <= 0 ? "empty" : pkg && headline <= 2 ? "low" : "ok";
  const t = TONE[tone];
  // Só existe o que renovar quando existe pacote; aula experimental não se "renova".
  const showLowAlert = !hideAlert && tone === "low" && pkg?.origin !== "trial";

  const unit =
    pkg || saldo
      ? plural(headline, "aula restante", "aulas restantes")
      : plural(headline, "aula disponível", "aulas disponíveis");

  const summary = [
    saldo ? `${used} de ${total} ${plural(total, "feita", "feitas")}` : `${used} de ${total} ${plural(total, "usada", "usadas")}`,
    booked > 0 ? `${booked} ${plural(booked, "agendada", "agendadas")}` : null,
    // Só vale dizer "para agendar" quando há as duas coisas; sem agendadas, o número grande já diz.
    booked > 0 && free > 0 ? `${free} para agendar` : null,
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
          <div aria-hidden className="mt-4 mb-3">
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
