import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, X } from "lucide-react";
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

// Opção marcada: antes o texto era o vermelho de destaque (`text-primary`) sobre vermelho translúcido — 3,5:1 num texto de 14px — e a
// desmarcada tinha contorno de 1,5:1. Agora: texto normal + ✓ (não depende só de cor), contorno legível e anel de foco por teclado.
const OPCAO_BASE =
  "relative flex gap-3 min-h-[56px] px-4 rounded-2xl border transition-all active:scale-[0.99] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring";
const OPCAO_ON = "bg-primary/15 border-primary";
const OPCAO_OFF = "bg-secondary border-muted-foreground/50";

/**
 * Título das telas do questionário. O questionário tem a própria barra (voltar, progresso, sair) e não usava o cabeçalho do app: o aluno
 * via "PERFIL DE BOXE" só na escolha da versão e o professor nunca via título — e o "Avaliando <nome>" (12,5px) sumia depois de escolher a
 * versão, então quem avalia o 5º aluno da noite não via de quem se tratava. `subtitle` leva o nome/contexto e é sempre visível.
 */
export function BoxingProfileHeading({ subtitle }: { subtitle: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="page-title">PERFIL DE BOXE</h1>
      <div className="text-[13.5px] text-muted-foreground mt-0.5">{subtitle}</div>
    </div>
  );
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
  /** Cabeçalho acima da barra do questionário (ver `BoxingProfileHeading`). */
  heading?: ReactNode;
  /** Só para a página de amostras de desenvolvimento: abre já na tela de resumo. */
  resumoInicial?: boolean;
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
  heading,
  resumoInicial,
}: BoxingProfileQuestionnaireProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  // Tela final de conferência ("Você respondeu N de N"): antes "Concluir" na última pergunta ENVIAVA direto, sem a pessoa rever nada.
  const [resumo, setResumo] = useState(!!resumoInicial);
  // Veio do resumo para corrigir UMA resposta: ao responder, volta ao resumo (não segue pela lista de perguntas).
  const [deResumo, setDeResumo] = useState(false);
  const tituloResumoRef = useRef<HTMLHeadingElement>(null);
  const perguntaRef = useRef<HTMLFieldSetElement>(null);
  const jaMontou = useRef(false);
  const avancoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ao mudar de pergunta (avançar, voltar ou o avanço automático) o foco vai para a pergunta nova: antes ele caía no <body> (o botão
  // "Avançar" ficava desativado na pergunta seguinte) e o leitor de tela não ouvia a pergunta. Não na primeira montagem: não rouba o foco.
  useEffect(() => {
    if (!jaMontou.current) {
      jaMontou.current = true;
      return;
    }
    perguntaRef.current?.focus();
  }, [index]);

  useEffect(() => {
    if (resumo) tituloResumoRef.current?.focus();
  }, [resumo]);

  // Cancela um avanço automático pendente ao sair da tela ou mudar de pergunta.
  useEffect(() => {
    return () => {
      if (avancoRef.current) clearTimeout(avancoRef.current);
    };
  }, [index]);

  useEffect(() => {
    const draft = loadDraft(draftKey);
    setAnswers(draft);
    // Retoma na primeira pergunta ainda sem resposta, não sempre em 0 — a versão anterior
    // restaurava as respostas mas reabria em 0 incondicionalmente, então dava pra chegar na
    // pergunta certa clicando "Avançar" várias vezes, sem perder nada, só com fricção. Gaps no
    // meio (responder 5 sem ter respondido 3/4) não são possíveis pela UI hoje — `goNext` só anda
    // uma pergunta por vez e exige a atual respondida — mas `findIndex` cobre esse caso também se
    // um dia deixar de ser verdade. Se tudo já estiver respondido, abre na última (pra revisar/
    // enviar), não fora do array.
    const firstUnanswered = questions.findIndex((q) => draft[q.id] === undefined);
    setIndex(firstUnanswered === -1 ? questions.length - 1 : firstUnanswered);
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
  const missing = useMemo(() => missingQuestionIds(answers, questions), [answers, questions]);

  function goNext() {
    if (!answered) return;
    if (deResumo) {
      setDeResumo(false);
      setResumo(true);
      return;
    }
    if (isLast) {
      if (!isComplete(answers, questions)) {
        toast.error(`Faltam ${missing.length} questão(ões) para concluir. Volte e responda todas.`);
        return;
      }
      setResumo(true);
      return;
    }
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  /** Rótulo da resposta dada a uma pergunta (para o resumo). */
  function rotuloDa(q: Question): string {
    const v = answers[q.id];
    if (v === undefined) return "Sem resposta";
    if (q.type === "likert") return LIKERT_OPTIONS.find((o) => o.value === v)?.label ?? String(v);
    return q.options.find((o) => o.value === v)?.label ?? String(v);
  }

  /**
   * Pergunta de ESCALA (5 níveis de frequência): tocar na resposta abre a próxima sozinha, depois de um instante para ver a escolha
   * (antes eram dois toques por pergunta: 28 na versão rápida, 74 na completa). Dá para voltar e mudar. Nunca avança sozinho na
   * última pergunta (concluir é uma decisão) nem nas de ESCOLHA entre situações (exigem ler opções longas).
   */
  function responde(value: Answers[string]) {
    setAnswers((a) => ({ ...a, [question.id]: value }));
    if (avancoRef.current) clearTimeout(avancoRef.current);
    if (question.type === "likert" && (!isLast || deResumo)) {
      avancoRef.current = setTimeout(() => {
        if (deResumo) {
          setDeResumo(false);
          setResumo(true);
        } else {
          setIndex((i) => Math.min(i + 1, questions.length - 1));
        }
      }, 350);
    }
  }

  function goBack() {
    if (avancoRef.current) clearTimeout(avancoRef.current);
    if (resumo) {
      // Do resumo, "voltar" reabre a última pergunta.
      setResumo(false);
      setIndex(questions.length - 1);
      return;
    }
    if (deResumo) {
      setDeResumo(false);
      setResumo(true);
      return;
    }
    if (index === 0) {
      setConfirmExit(true);
      return;
    }
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div>
      {heading}
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Voltar"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-muted-foreground/50 flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-[18px] w-[18px] text-foreground" aria-hidden />
        </button>
        <div className="flex-1">
          <div className="text-[12px] text-muted-foreground mb-1.5" aria-live="polite">
            {resumo ? "Revisão final" : `Questão ${index + 1} de ${questions.length}`}
          </div>
          <div
            className="h-1.5 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-label="Progresso do questionário"
            aria-valuetext={resumo ? "Revisão final" : `Questão ${index + 1} de ${questions.length}`}
            aria-valuenow={resumo ? questions.length : index + 1}
            aria-valuemin={1}
            aria-valuemax={questions.length}
          >
            <div
              className="h-full rounded-full bg-gradient-gold transition-[width] duration-300"
              style={{ width: `${((resumo ? questions.length : index + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmExit(true)}
          aria-label="Sair do questionário"
          className="h-11 w-11 shrink-0 rounded-xl bg-secondary border border-muted-foreground/50 flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-[18px] w-[18px] text-muted-foreground" aria-hidden />
        </button>
      </div>

      {resumo ? (
        <section aria-labelledby="resumo-titulo" className="mt-6 mb-6">
          <h2
            id="resumo-titulo"
            ref={tituloResumoRef}
            tabIndex={-1}
            className="text-[19px] font-semibold text-foreground leading-snug mb-1 focus:outline-none"
          >
            Confira suas respostas
          </h2>
          <p className="text-[13.5px] text-muted-foreground mb-4">
            Você respondeu {questions.length - missing.length} de {questions.length} perguntas. Toque numa resposta para mudá-la.
          </p>
          <ul className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setDeResumo(true);
                    setResumo(false);
                  }}
                  className="w-full text-left rounded-2xl border border-muted-foreground/50 bg-secondary px-4 py-3 min-h-[56px] active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block text-[12.5px] text-muted-foreground leading-snug line-clamp-2">
                    {i + 1}. {q.text}
                  </span>
                  <span className="block text-[14px] font-semibold text-foreground leading-snug mt-0.5">{rotuloDa(q)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
      <fieldset ref={perguntaRef} tabIndex={-1} className="mt-6 mb-8 focus:outline-none">
          <legend className="text-[19px] font-semibold text-foreground leading-snug mb-5">{question.text}</legend>
  
          {question.type === "likert" && (
            <div className="flex flex-col gap-2.5">
              {LIKERT_OPTIONS.map((opt) => {
                const checked = answers[question.id] === opt.value;
                return (
                  <label key={opt.value} className={cn(OPCAO_BASE, "items-center", checked ? OPCAO_ON : OPCAO_OFF)}>
                    <input
                      type="radio"
                      name={question.id}
                      value={opt.value}
                      checked={checked}
                      onChange={() => responde(opt.value)}
                      className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <span className={cn("flex-1 text-[14.5px]", checked ? "font-semibold text-foreground" : "font-medium text-foreground/85")}>
                      {opt.label}
                    </span>
                    {checked && <Check className="h-4 w-4 shrink-0 text-[hsl(var(--red-text))]" strokeWidth={3} aria-hidden />}
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
                  <label key={opt.value} className={cn(OPCAO_BASE, "items-start py-3", checked ? OPCAO_ON : OPCAO_OFF)}>
                    <input
                      type="radio"
                      name={question.id}
                      value={opt.value}
                      checked={checked}
                      onChange={() => responde(opt.value)}
                      className="h-5 w-5 shrink-0 mt-0.5 accent-[hsl(var(--primary))]"
                    />
                    <span className={cn("flex-1 text-[14px] leading-snug", checked ? "text-foreground font-semibold" : "text-foreground/85")}>
                      {opt.label}
                    </span>
                    {checked && <Check className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(var(--red-text))]" strokeWidth={3} aria-hidden />}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
  
        {question.type === "likert" && !isLast && index === 0 && (
          <p className="text-[12.5px] text-muted-foreground text-center -mt-4 mb-4">
            Ao tocar numa resposta, a próxima pergunta abre sozinha. Você pode voltar e mudar.
          </p>
        )}
  
        <Button size="lg" className="w-full" onClick={goNext} disabled={!answered}>
          {deResumo ? "Voltar ao resumo" : isLast ? "Revisar respostas" : "Avançar"}
        </Button>
        </>
      )}

      {resumo ? (
        <Button size="lg" className="w-full" onClick={() => submit.mutate()} disabled={missing.length > 0 || submit.isPending}>
          {submit.isPending ? "Enviando…" : "Enviar avaliação"}
        </Button>
      ) : null}

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
