import { Search } from "lucide-react";
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

/** Busca por nome + filtro de status — usado no histórico e listas do professor. */
export function BookingFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar",
  filters,
  activeFilter,
  onFilterChange,
}: BookingFiltersProps) {
  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input-dark h-[46px] pl-10"
        />
      </div>
      {filters && (
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 mb-3.5 scroll-fade-x">
          {filters.map((f) => {
            const on = activeFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onFilterChange?.(f.value)}
                className={cn(
                  "shrink-0 h-9 px-3.5 rounded-full border text-[12.5px] font-semibold transition-all active:scale-95",
                  on ? "bg-primary border-primary text-primary-foreground" : "bg-secondary border-border text-muted-foreground",
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
