import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import {
  LIKERT_OPTIONS,
  QUESTIONNAIRE_VERSION,
  QUESTIONS,
  TOTAL_QUESTIONS,
  isComplete,
  missingQuestionIds,
  type Answers,
} from "@/lib/boxingProfile";
import { studentIdForProfile, submitBoxingProfileAssessment } from "@/integrations/backend/api";

function draftKey(userId: string) {
  return `bb.boxing-profile-draft.${userId}`;
}

function loadDraft(userId: string): Answers {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed?.questionnaireVersion !== QUESTIONNAIRE_VERSION) return {};
    return parsed.answers ?? {};
  } catch {
    return {};
  }
}

function saveDraft(userId: string, answers: Answers) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify({ questionnaireVersion: QUESTIONNAIRE_VERSION, answers }));
  } catch {
    /* privado/sem storage — só perde a preservação entre sessões, não trava o questionário */
  }
}

function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* idem */
  }
}

export default function StudentPerfilLutadorQuestionario() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    if (profile) setAnswers(loadDraft(profile.id));
  }, [profile?.id]);

  useEffect(() => {
    if (profile && Object.keys(answers).length > 0) saveDraft(profile.id, answers);
  }, [answers, profile?.id]);

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const submit = useMutation({
    mutationFn: () => submitBoxingProfileAssessment(studentId!, answers),
    onSuccess: (assessment) => {
      if (profile) clearDraft(profile.id);
      navigate(`/app/perfil-lutador/resultado/${assessment.id}`, { replace: true });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível concluir a avaliação."),
  });

  const question = QUESTIONS[index];
  const answered = answers[question.id] !== undefined;
  const isLast = index === QUESTIONS.length - 1;
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
    setIndex((i) => Math.min(i + 1, QUESTIONS.length - 1));
  }

  function goBack() {
    if (index === 0) {
      setConfirmExit(true);
      return;
    }
    setIndex((i) => Math.max(i - 1, 0));
  }

  if (!profile) return null;

  return (
    <div className="page-container">
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
            Questão {index + 1} de {TOTAL_QUESTIONS}
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={TOTAL_QUESTIONS}>
            <div
              className="h-full rounded-full bg-gradient-gold transition-[width] duration-300"
              style={{ width: `${((index + 1) / TOTAL_QUESTIONS) * 100}%` }}
            />
          </div>
        </div>
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
        description="Suas respostas ficam salvas neste dispositivo — você pode continuar de onde parou depois."
        confirmLabel="Sair"
        cancelLabel="Continuar"
        onConfirm={() => navigate("/app/perfil-lutador")}
      />
    </div>
  );
}
