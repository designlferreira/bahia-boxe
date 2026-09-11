import { Sparkles, ListChecks } from "lucide-react";
import type { AssessmentLength } from "@/lib/boxingProfile";

interface BoxingProfileLengthChoiceProps {
  onChoose: (length: AssessmentLength) => void;
  /** Quantidade real de perguntas de cada variante nesta voz (self: 14/37; coach: 14/35). */
  questionCount: Record<AssessmentLength, number>;
}

/**
 * Primeira tela do questionário: escolher rápida ou completa antes de começar a responder. Os
 * scores das duas variantes não são diretamente comparáveis (CLAUDE.md, "Compatibilidade entre
 * curta e completa"), então a escolha precisa ser explícita, não um detalhe que passa despercebido.
 */
export function BoxingProfileLengthChoice({ onChoose, questionCount }: BoxingProfileLengthChoiceProps) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onChoose("short")}
        className="card-dark p-4 text-left w-full active:scale-[0.99] transition-transform border border-border"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-[14.5px] font-semibold text-foreground">Versão rápida</span>
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {questionCount.short} perguntas, poucos minutos. Boa pra uma primeira leitura ou pra repetir com frequência.
        </p>
      </button>

      <button
        type="button"
        onClick={() => onChoose("full")}
        className="card-dark p-4 text-left w-full active:scale-[0.99] transition-transform border border-border"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <ListChecks className="h-4 w-4 text-accent" />
          <span className="text-[14.5px] font-semibold text-foreground">Versão completa</span>
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          {questionCount.full} perguntas, mais detalhada. Considera também envergadura, se estiver no cadastro.
        </p>
      </button>

      <p className="text-[11px] text-muted-foreground leading-relaxed text-center mt-1">
        Os resultados das duas versões não são diretamente comparáveis entre si.
      </p>
    </div>
  );
}
