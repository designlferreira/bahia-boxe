import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { NOME_DO_APP, tituloDaRota } from "@/lib/titulosDeRota";

/**
 * A cada troca de tela: põe o título na aba ("Agenda · Bahia Boxe") e avisa o leitor de tela ("Agenda") numa região `aria-live`.
 * Num app de uma página só o navegador não faz nenhum dos dois sozinho. O primeiro carregamento NÃO é anunciado (o leitor já lê o título
 * da página ao abrir). Endereço sem título (a 404) fica com a própria tela, que define o dela. Vai DENTRO do `BrowserRouter`.
 */
export function AnunciadorDeRota() {
  const { pathname } = useLocation();
  const [aviso, setAviso] = useState("");
  const primeira = useRef(true);

  useEffect(() => {
    const titulo = tituloDaRota(pathname);
    if (titulo) document.title = `${titulo} · ${NOME_DO_APP}`;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    setAviso(titulo ?? "");
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {aviso}
    </div>
  );
}
