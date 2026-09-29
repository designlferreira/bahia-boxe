import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Campo em que se digita (texto, e-mail, senha, busca...): checkbox, botão, faixa etc. não abrem o teclado. */
function ehCampoDeTexto(el: Element | null) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image"].includes((el as HTMLInputElement).type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * No celular (ponteiro "grosso") a barra fixa sobe junto com o teclado virtual e ocupa 84px de uma tela já curta, justo nos formulários
 * (Meus dados físicos, Orientações da aula, Nova senha, buscas). Enquanto um campo de texto está com o foco, ela sai da frente. No computador
 * (mouse) nada muda: o teclado não ocupa a tela.
 */
function useCampoDeTextoFocado() {
  const [focado, setFocado] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
    const atualiza = () => setFocado(ehCampoDeTexto(document.activeElement));
    // No `focusout` o próximo elemento ainda não tem o foco: lê depois.
    const aoSair = () => window.setTimeout(atualiza, 0);
    document.addEventListener("focusin", atualiza);
    document.addEventListener("focusout", aoSair);
    return () => {
      document.removeEventListener("focusin", atualiza);
      document.removeEventListener("focusout", aoSair);
    };
  }, []);
  return focado;
}

/**
 * Casca das duas barras de baixo. A altura e o espaço de baixo respeitam a área segura do iPhone (`env(safe-area-inset-bottom)`, com o 22px de
 * sempre como mínimo): antes eram fixos, e num aparelho com a barra de gesto grande os alvos ficavam sob o indicador. A altura é 62px (10px de
 * cima + 52px da aba) mais o espaço de baixo.
 */
export function BottomNavShell({ children }: { children: ReactNode }) {
  const teclado = useCampoDeTextoFocado();
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-border bg-background/92 pt-2.5 backdrop-blur-xl",
        "transition-transform duration-200 motion-reduce:transition-none",
        teclado && "translate-y-full pointer-events-none",
      )}
      // Mesma coluna centralizada do `.page-container`: no tablet as abas não se espalham.
      style={{
        height: "calc(62px + max(22px, env(safe-area-inset-bottom)))",
        paddingBottom: "max(22px, env(safe-area-inset-bottom))",
        paddingInline: "max(0.875rem, calc((100% - 30rem) / 2))",
      }}
    >
      {children}
    </nav>
  );
}
