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
}

/**
 * Card único de "pacote ativo" — uma linha de `packages`, seja qual for a origem (decisão do
 * CLAUDE.md, 2026-09-08: recorrência não é uma entidade paralela, é só mais um `packages` com
 * `origin = 'recurrence'`). Usado por `AlunoDetalhe.tsx` e `AlunoRecorrencia.tsx` — MESMA
 * instância nos dois lugares, não duas versões do mesmo conceito.
 */
export function ActivePackageCard({ pkg, credits, saldo }: ActivePackageCardProps) {
  return (
    <div className="rounded-[20px] p-[18px] bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-[#35301A]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11.5px] uppercase tracking-wide text-accent/70 font-semibold">Pacote ativo</div>
        {pkg && <Badge className="bg-accent/15 text-accent">{ORIGIN_LABEL[pkg.origin]}</Badge>}
      </div>
      <div className="flex items-end gap-2 my-1 mb-3">
        <span className="font-display text-[56px] leading-[0.85] text-accent">{credits}</span>
        <span className="text-[13px] text-muted-foreground pb-2">créditos disponíveis</span>
      </div>
      {pkg ? (
        <>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
              style={{ width: `${packageProgressPct(pkg.totalClasses, pkg.usedClasses)}%` }}
            />
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {pkg.usedClasses} de {pkg.totalClasses} usadas
            {saldo && saldo.aRepor > 0 && <span className="text-amber"> · {saldo.aRepor} aguardando reposição</span>}
          </div>
        </>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">Sem pacote ativo</div>
      )}
    </div>
  );
}
