import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { LIKERT_OPTIONS, QUESTIONNAIRE_VERSION, isComplete, missingQuestionIds, type Answers, type Question } from "@/lib/boxingProfile";

function loadDraft(key: string): Answers {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.questionnaireVersion !== QUESTIONNAIRE_VERSION) return {};
    return parsed.answers ?? {};
  } catch {
    return {};
  }
}

function saveDraft(key: string, answers: Answers) {
  try {
    localStorage.setItem(key, JSON.stringify({ questionnaireVersion: QUESTIONNAIRE_VERSION, answers }));
  } catch {
    /* privado/sem storage — só perde a preservação entre sessões, não trava o questionário */
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* idem */
  }
}

interface BoxingProfileQuestionnaireProps {
  /** QUESTIONS (voz do aluno) ou COACH_QUESTIONS (voz do professor) — mesmos 32 ids, texto diferente. */
  questions: Question[];
  /**
   * Chave de rascunho completa, já namespaced por quem responde (`bb.boxing-profile-draft.self.<userId>`
   * vs `bb.boxing-profile-draft.coach.<professorId>.<studentId>`) — este componente não presume nada
   * sobre quem está preenchendo, só lê/escreve nessa chave.
   */
  draftKey: string;
  onSubmit: (answers: Answers) => Promise<{ id: string }>;
  onSuccess: (result: { id: string }) => void;
  onError?: (err: unknown) => void;
  onExit: () => void;
  exitDescription?: string;
}

/**
 * UI do questionário de 32 perguntas, genérica quanto a quem responde (aluno sobre si mesmo, ou
 * professor sobre o aluno) — a diferença fica inteira nas props (`questions`/`draftKey`/`onSubmit`),
 * nunca em condicional aqui dentro.
 */
export function BoxingProfileQuestionnaire({
  questions,
  draftKey,
  onSubmit,
  onSuccess,
  onError,
  onExit,
  exitDescription = "Suas respostas ficam salvas neste dispositivo — você pode continuar de onde parou depois.",
}: BoxingProfileQuestionnaireProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    setAnswers(loadDraft(draftKey));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (Object.keys(answers).length > 0) saveDraft(draftKey, answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, draftKey]);

  const submit = useMutation({
    mutationFn: () => onSubmit(answers),
    onSuccess: (result) => {
      clearDraft(draftKey);
      onSuccess(result);
    },
    onError: (err) => {
      if (onError) onError(err);
      else toast.error(err instanceof Error ? err.message : "Não foi possível concluir a avaliação.");
    },
  });

  const question = questions[index];
  const answered = answers[question.id] !== undefined;
  const isLast = index === questions.length - 1;
  const missing = useMemo(() => missingQuestionIds(answers), [answers]);

  function goNext() {
    if (!answered) return;
    if (isLast) {
      if (!isComplete(answers)) {
        toast.error(`Faltam ${missing.length} questão(ões) para concluir. Volte e responda todas.`);
        return;
      }
      submit.mutate();
      return;
    }
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  function goBack() {
    if (index === 0) {
      setConfirmExit(true);
      return;
    }
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Voltar"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
        </button>
        <div className="flex-1">
          <div className="text-[12px] text-muted-foreground mb-1.5" aria-live="polite">
            Questão {index + 1} de {questions.length}
          </div>
          <div
            className="h-1.5 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={questions.length}
          >
            <div
              className="h-full rounded-full bg-gradient-gold transition-[width] duration-300"
              style={{ width: `${((index + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          aria-label="Sair do questionário"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="h-[18px] w-[18px] text-muted-foreground" />
        </button>
      </div>

      <fieldset className="mt-6 mb-8">
        <legend className="text-[19px] font-semibold text-foreground leading-snug mb-5">{question.text}</legend>

        {question.type === "likert" && (
          <div className="flex flex-col gap-2.5">
            {LIKERT_OPTIONS.map((opt) => {
              const checked = answers[question.id] === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-center gap-3 min-h-[56px] px-4 rounded-2xl border transition-all active:scale-[0.99]",
                    checked ? "bg-primary/15 border-primary" : "bg-secondary border-border",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={opt.value}
                    checked={checked}
                    onChange={() => setAnswers((a) => ({ ...a, [question.id]: opt.value }))}
                    className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn("text-[14.5px] font-medium", checked ? "text-primary" : "text-foreground/85")}>{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {question.type === "behavioral" && (
          <div className="flex flex-col gap-2.5">
            {question.options.map((opt) => {
              const checked = answers[question.id] === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-3 min-h-[56px] px-4 py-3 rounded-2xl border transition-all active:scale-[0.99]",
                    checked ? "bg-primary/15 border-primary" : "bg-secondary border-border",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={opt.value}
                    checked={checked}
                    onChange={() => setAnswers((a) => ({ ...a, [question.id]: opt.value }))}
                    className="h-5 w-5 shrink-0 mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn("text-[14px] leading-snug", checked ? "text-primary font-medium" : "text-foreground/85")}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <Button size="lg" className="w-full" onClick={goNext} disabled={!answered || submit.isPending}>
        {submit.isPending ? "Enviando…" : isLast ? "Concluir" : "Avançar"}
      </Button>

      <ConfirmDialog
        open={confirmExit}
        onOpenChange={setConfirmExit}
        title="SAIR DO QUESTIONÁRIO?"
        description={exitDescription}
        confirmLabel="Sair"
        cancelLabel="Continuar"
        onConfirm={onExit}
      />
    </div>
  );
}
