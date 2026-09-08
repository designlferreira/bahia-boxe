import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { packageProgressPct } from "@/lib/packageUtils";
import type { PackageRecord, SaldoPacote } from "@/integrations/backend/types";

const ORIGIN_LABEL: Record<PackageRecord["origin"], string> = {
  trial: "Experimental",
  purchase: "Compra",
  admin_grant: "Concedido",
  recurrence: "Recorrência",
};

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
 * `saldo.restantes` ("Aulas restantes"), não `credits`. Pra qualquer outra origem, comportamento
 * de sempre: `credits`, rótulo "Créditos disponíveis".
 */
export function ActivePackageCard({ pkg, credits, saldo, hideAlert }: ActivePackageCardProps) {
  const headline = saldo ? saldo.restantes : credits;
  const lowCredits = saldo ? saldo.restantes <= 2 : credits <= 2;

  return (
    <div className="rounded-[20px] p-[18px] bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-[#35301A]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11.5px] uppercase tracking-wide text-accent/70 font-semibold">
          {saldo ? "Aulas restantes" : "Créditos disponíveis"}
        </div>
        {pkg && <Badge className="bg-accent/15 text-accent">{ORIGIN_LABEL[pkg.origin]}</Badge>}
      </div>
      <div className="flex items-end gap-2 my-1 mb-3">
        <span className="font-display text-[56px] leading-[0.85] text-accent">{headline}</span>
        <span className="text-[13px] text-muted-foreground pb-2">{saldo ? "aula(s) no pacote" : "créditos disponíveis"}</span>
      </div>
      {pkg ? (
        <>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
              style={{ width: `${packageProgressPct(pkg.totalClasses, pkg.usedClasses)}%` }}
            />
          </div>
          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>
              {pkg.usedClasses} de {pkg.totalClasses} usadas
              {saldo && saldo.aRepor > 0 && <span className="text-amber"> · {saldo.aRepor} aguardando reposição</span>}
            </span>
            <span>{pkg.templateName}</span>
          </div>
        </>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">Sem pacote ativo</div>
      )}
      {!hideAlert && lowCredits && (
        <div className="mt-3.5 flex gap-2 items-center px-3 py-2.5 rounded-xl bg-amber/10 border border-amber/30">
          <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
          <span className="text-[12.5px] text-amber">
            {saldo ? "Restam poucas aulas no pacote atual." : "Restam poucas aulas — considere renovar o pacote."}
          </span>
        </div>
      )}
    </div>
  );
}
