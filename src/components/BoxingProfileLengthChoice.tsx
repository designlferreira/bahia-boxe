import { Sparkles, ListChecks } from "lucide-react";
import type { AssessmentLength } from "@/lib/boxingProfile";

interface BoxingProfileLengthChoiceProps {
  onChoose: (length: AssessmentLength) => void;
  /** Quantidade real de perguntas de cada variante nesta voz (self: 14/37; coach: 14/35). */
  questionCount: Record<AssessmentLength, number>;
  /** Quem está respondendo: muda a frase sobre altura/envergadura (o aluno tem os próprios dados; o professor lê os do aluno). */
  voz: "self" | "coach";
  /** Só na voz do aluno: abre "Meus dados físicos" (a versão completa usa altura e envergadura, se preenchidas). */
  onOpenDadosFisicos?: () => void;
}

const CARTAO =
  "card-dark p-4 text-left w-full active:scale-[0.99] transition-transform border border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Primeira tela do questionário: escolher rápida ou completa antes de começar a responder. Os
 * scores das duas variantes não são diretamente comparáveis (CLAUDE.md, "Compatibilidade entre
 * curta e completa"), então a escolha precisa ser explícita, não um detalhe que passa despercebido.
 *
 * Antes os dois cartões eram idênticos e a pessoa não tinha base para decidir (a iniciante escolhia a completa "para ser mais precisa" e
 * desistia na pergunta 20): agora a rápida é a recomendada, sem prometer minutos que ninguém mediu.
 */
export function BoxingProfileLengthChoice({ onChoose, questionCount, voz, onOpenDadosFisicos }: BoxingProfileLengthChoiceProps) {
  const ehAluno = voz === "self";
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => onChoose("short")} aria-describedby="versao-rapida-desc" className={CARTAO}>
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span className="text-[14.5px] font-semibold text-foreground">Versão rápida</span>
          <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
            {ehAluno ? "Recomendada para a primeira vez" : "Recomendada para começar"}
          </span>
        </div>
        <p id="versao-rapida-desc" className="text-[12.5px] text-muted-foreground leading-relaxed">
          {questionCount.short} perguntas, poucos minutos. Boa pra uma primeira leitura ou pra repetir com frequência.
        </p>
      </button>

      <button type="button" onClick={() => onChoose("full")} aria-describedby="versao-completa-desc" className={CARTAO}>
        <div className="flex items-center gap-2 mb-1.5">
          <ListChecks className="h-4 w-4 text-accent" aria-hidden />
          <span className="text-[14.5px] font-semibold text-foreground">Versão completa</span>
        </div>
        <p id="versao-completa-desc" className="text-[12.5px] text-muted-foreground leading-relaxed">
          {questionCount.full} perguntas, mais detalhada e mais demorada.{" "}
          {ehAluno
            ? "Usa também a sua altura e envergadura, se você as preencheu."
            : "Usa também a altura e a envergadura do aluno, se estiverem no cadastro dele."}
        </p>
      </button>

      {ehAluno && onOpenDadosFisicos && (
        <button
          type="button"
          onClick={onOpenDadosFisicos}
          className="self-start min-h-11 px-1 -mt-1 text-[13px] font-semibold text-accent underline underline-offset-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Preencher altura e envergadura em Meus dados físicos
        </button>
      )}

      {/* Antes: "Os resultados das duas versões não são diretamente comparáveis entre si." — um aviso solto no rodapé. Agora diz o que fazer. */}
      <p className="text-xs text-muted-foreground leading-relaxed text-center mt-1">
        Nas próximas vezes, escolha a mesma versão para acompanhar a evolução: os resultados da rápida e da completa não são comparáveis.
      </p>
    </div>
  );
}
