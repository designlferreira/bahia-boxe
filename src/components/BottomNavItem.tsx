import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A rota está "dentro" de algum destes prefixos (pelo limite do segmento: "/app/aula" casa "/app/aula/7", não "/app/aulas"). */
export function casaPrefixo(pathname: string, prefixos: string[]) {
  return prefixos.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface BottomNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Rotas que pertencem a esta aba (a própria `to` sempre conta): assim uma tela de segundo nível acende a aba de onde ela vem. */
  prefixos?: string[];
  /** Selo (contador) sobre o ícone; o texto para leitor de tela vai em `badgeTexto`. */
  children?: ReactNode;
}

/**
 * Uma aba das barras de baixo (aluno e professor), no MESMO componente: as duas foram copiadas uma da outra e divergiram (rótulo de
 * 12px x 9,5px, cinza cheio x apagado a 3,8:1, sem foco visível). Ativa = cor + um traço no topo (a cor sozinha não é uma marca de forma) e
 * `aria-current="page"`.
 */
export function BottomNavItem({ to, label, icon: Icon, prefixos = [], children }: BottomNavItemProps) {
  const { pathname } = useLocation();
  const ativa = casaPrefixo(pathname, [to, ...prefixos]);
  return (
    <Link
      to={to}
      aria-current={ativa ? "page" : undefined}
      className={cn(
        "relative flex-1 min-w-0 h-[52px] flex flex-col items-center justify-center gap-1 rounded-lg active:scale-95 transition-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        ativa ? "text-[hsl(var(--nav-active))]" : "text-muted-foreground",
      )}
    >
      {ativa && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-[hsl(var(--nav-active))]" />}
      <Icon className="h-[21px] w-[21px]" strokeWidth={2} aria-hidden />
      <span className={cn("text-xs", ativa ? "font-bold" : "font-semibold")}>{label}</span>
      {children}
    </Link>
  );
}
