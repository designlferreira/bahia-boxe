interface BoxingProfilePartialNoticeProps {
  text: string;
  /**
   * Quem ainda falta. Âmbar significa "depende do professor" no app: só é âmbar quando o que falta é a
   * avaliação DO PROFESSOR; quando falta o aluno, é um aviso neutro (não há nada pendente com o professor).
   */
  waiting: "coach" | "student";
}

/**
 * Badge + texto de apoio pro caso "só um dos dois respondeu" — usado nas quatro combinações de
 * viewer × lado faltante (aluno/professor × self/coach). Texto vem de quem chama porque cada
 * combinação tem sua própria frase (CLAUDE.md, "Resultado combinado de Perfil de Boxe"). Fica logo
 * abaixo do destaque do resultado, sempre no mesmo lugar (antes mudava de posição conforme o estado).
 */
export function BoxingProfilePartialNotice({ text, waiting }: BoxingProfilePartialNoticeProps) {
  return (
    <div className="mb-5">
      <span
        className={
          waiting === "coach"
            ? "inline-block text-xs font-bold uppercase tracking-wide text-amber bg-amber/10 rounded-full px-2.5 py-1 mb-2"
            : "inline-block text-xs font-bold uppercase tracking-wide text-muted-foreground bg-secondary rounded-full px-2.5 py-1 mb-2"
        }
      >
        Resultado parcial
      </span>
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}
