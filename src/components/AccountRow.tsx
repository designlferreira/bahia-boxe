import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

interface AccountRowProps {
  label: string;
  hint?: string;
  icon: LucideIcon;
  onClick?: () => void;
  /** Link externo (abre em outra aba); sem href, é um botão. */
  href?: string;
  last?: boolean;
}

/**
 * Linha de "Minha conta" — a MESMA para aluno e professor (antes cada tela tinha a sua cópia, e a do professor ficou para trás: sem
 * foco visível, sem ícone numa linha, divisor de 1,1:1). Ícone obrigatório: uma linha sem ele desalinha o texto das outras.
 */
export function AccountRow({ label, hint, icon: Icon, onClick, href, last }: AccountRowProps) {
  const cls = `min-h-[52px] px-4 py-2 flex items-center gap-2.5 text-left text-[14.5px] text-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
    last ? "" : "border-b border-border"
  }`;
  const conteudo = (
    <>
      <Icon className="h-[17px] w-[17px] text-muted-foreground shrink-0" aria-hidden />
      <span className="flex-1">
        {label}
        {hint && <span className="block text-[12.5px] text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {conteudo}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {conteudo}
    </button>
  );
}
