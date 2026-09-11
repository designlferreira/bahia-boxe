interface BoxingProfilePartialNoticeProps {
  text: string;
}

/**
 * Badge + texto de apoio pro caso "só um dos dois respondeu" — usado nas quatro combinações de
 * viewer × lado faltante (aluno/professor × self/coach). Texto vem de quem chama porque cada
 * combinação tem sua própria frase (CLAUDE.md, "Resultado combinado de Perfil de Boxe").
 */
export function BoxingProfilePartialNotice({ text }: BoxingProfilePartialNoticeProps) {
  return (
    <div className="mb-5">
      <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-amber bg-amber/10 rounded-full px-2.5 py-1 mb-2">
        Resultado parcial
      </span>
      <p className="text-[11.5px] text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}
