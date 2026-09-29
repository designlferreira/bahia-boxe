import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { direcaoDeNavegacao } from "@/lib/direcaoDeNavegacao";

/**
 * Escolhe de que lado a tela nova entra e avisa o CSS pelo atributo `data-nav` no `<html>` (ver `index.css`: `bb-avanca`, `bb-recua`, `bb-fade`).
 * Só a ENTRADA é direcional; a tela antiga não anima a saída (sem biblioteca, o React a desmonta na hora). É `useLayoutEffect` de propósito:
 * o atributo precisa estar posto antes de a tela nova ser desenhada, senão ela começaria com a entrada padrão.
 * Vai DENTRO do `BrowserRouter`.
 */
export function TransicaoDeTela() {
  const { pathname } = useLocation();
  const tipo = useNavigationType();
  const anterior = useRef<string | null>(null);

  useLayoutEffect(() => {
    const direcao = direcaoDeNavegacao(tipo, anterior.current, pathname);
    anterior.current = pathname;
    const html = document.documentElement;
    if (direcao) html.dataset.nav = direcao;
    else delete html.dataset.nav;
  }, [pathname, tipo]);

  return null;
}
