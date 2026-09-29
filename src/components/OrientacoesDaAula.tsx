import { Clock3, MapPin } from "lucide-react";
import {
  arrivalMessage,
  equipmentItems,
  formatAddress,
  hasAddress,
  mapsUrl,
  type ClassGuidelines,
} from "@/lib/classGuidelines";

type Orientacoes = Omit<ClassGuidelines, "adminId"> | null | undefined;

/** Tem algo que o aluno enxergaria? (mesmas regras dos blocos abaixo) */
export function temOrientacoesVisiveis(g: Orientacoes) {
  if (!g) return false;
  return hasAddress(g) || !!arrivalMessage(g.arrivalMinutes) || equipmentItems(g.equipment).length > 0 || !!g.notes?.trim();
}

/**
 * As orientações da aula como o ALUNO as vê: "Onde será", chegada, "Leve para esta aula" e "Orientações". Um componente só, usado
 * no detalhe da aula do aluno E na prévia da tela do professor ("Como o aluno vai ver") — assim a prévia nunca diverge da realidade
 * (as regras: sem rua não há local; luvas/bandagem só aparecem com tamanho marcado).
 */
export function OrientacoesDaAula({ guidelines }: { guidelines: Orientacoes }) {
  const arrival = guidelines ? arrivalMessage(guidelines.arrivalMinutes) : null;
  const equipment = guidelines ? equipmentItems(guidelines.equipment) : [];
  const address = guidelines && hasAddress(guidelines) ? formatAddress(guidelines) : null;

  return (
    <>
      {address && (
        <div className="card-dark p-4 mb-3.5">
          <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> Onde será
          </h2>
          <div className="text-[14.5px] text-foreground/90 leading-snug">{address}</div>
          {guidelines?.referencePoint && (
            <div className="text-[12.5px] text-muted-foreground mt-1">Referência: {guidelines.referencePoint}</div>
          )}
          <a
            href={mapsUrl(guidelines!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center mt-2 text-[13px] font-semibold text-accent rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver no mapa
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </div>
      )}

      {arrival && (
        <div className="flex items-start gap-2.5 rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <Clock3 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{arrival}</div>
        </div>
      )}

      {equipment.length > 0 && (
        <div className="mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Leve para esta aula</h2>
          <div className="flex flex-wrap gap-2">
            {equipment.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-secondary px-3 py-2">
                <div className="text-[13px] font-semibold text-foreground">{item.label}</div>
                {item.sub && <div className="text-xs text-muted-foreground">{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {guidelines?.notes && (
        <div className="rounded-2xl p-4 bg-secondary/60 mb-3.5">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Orientações</h2>
          <div className="text-[13.5px] text-foreground/85 leading-relaxed">{guidelines.notes}</div>
        </div>
      )}
    </>
  );
}
