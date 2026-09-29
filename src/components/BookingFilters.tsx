import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusFilter {
  value: string;
  label: string;
}

interface BookingFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: StatusFilter[];
  activeFilter?: string;
  onFilterChange?: (v: string) => void;
}

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Busca por nome + filtro de status — usado no histórico e listas do professor. */
export function BookingFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar",
  filters,
  activeFilter,
  onFilterChange,
}: BookingFiltersProps) {
  const ativoRef = useRef<HTMLButtonElement>(null);
  // A fileira rola: o filtro escolhido (ou o primeiro ao trocar de lista) nunca fica escondido fora da tela.
  useEffect(() => {
    ativoRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeFilter, filters]);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        {/* type="search" + nome acessível: antes só havia o texto de exemplo (some ao digitar, não é rótulo). */}
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
          className="input-dark h-[46px] pl-10 pr-11 border-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpar busca"
            className={cn("absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground", FOCO)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {filters && (
        <div role="group" aria-label="Filtrar por status" className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 mb-3.5 scroll-fade-x">
          {filters.map((f) => {
            const on = activeFilter === f.value;
            return (
              <button
                key={f.value}
                ref={on ? ativoRef : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => onFilterChange?.(f.value)}
                className={cn(
                  `shrink-0 h-11 px-4 rounded-full border text-[13.5px] font-semibold transition-all active:scale-95 ${FOCO}`,
                  on ? "bg-primary border-primary text-primary-foreground" : "bg-secondary border-muted-foreground/60 text-muted-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
