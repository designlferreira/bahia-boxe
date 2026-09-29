import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, HelpCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { GuardInfoDialog } from "@/components/GuardInfoDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStudentProfile, saveStudentProfile, studentIdForProfile } from "@/integrations/backend/api";
import type { Guard, Laterality, Sex } from "@/integrations/backend/types";
import { GUARD_INFO, LATERALITY_LABELS, SEX_LABELS } from "@/lib/studentProfile";

interface Form {
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  wingspanCm: string;
  guard: Guard | null;
  laterality: Laterality | null;
}

/** Faixas aceitas (a tela é opcional: vazio vale). Um "168" digitado em Altura mudaria o estilo do Perfil de Boxe (envergadura ÷ altura). */
const FAIXAS = {
  heightCm: { min: 100, max: 250, msg: "Altura entre 100 e 250 cm." },
  weightKg: { min: 30, max: 300, msg: "Peso entre 30 e 300 kg." },
  wingspanCm: { min: 100, max: 260, msg: "Envergadura entre 100 e 260 cm." },
} as const;
type CampoNumerico = keyof typeof FAIXAS;

/** "59,5" ou "59.5" → 59.5; vazio → null; qualquer outra coisa → NaN (nunca chega ao banco: o Salvar fica bloqueado). */
function parseNumero(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  return Number(t.replace(",", "."));
}
function erroDoCampo(campo: CampoNumerico, v: string): string | null {
  const n = parseNumero(v);
  if (n === null) return null;
  const f = FAIXAS[campo];
  return Number.isNaN(n) || n < f.min || n > f.max ? f.msg : null;
}
/** Peso: até 3 dígitos, no máximo UM separador e uma casa decimal (o banco guarda numeric(5,1); antes "60,5,5" virava NaN). */
function limpaPeso(v: string) {
  const m = v.replace(/[^\d.,]/g, "").match(/^\d{0,3}(?:[.,]\d?)?/);
  return m ? m[0] : "";
}
function formDe(d: { sex: Sex | null; heightCm: number | null; weightKg: number | null; wingspanCm: number | null; guard: Guard | null; laterality: Laterality | null }): Form {
  return {
    sex: d.sex,
    heightCm: d.heightCm !== null ? String(d.heightCm) : "",
    weightKg: d.weightKg !== null ? String(d.weightKg) : "",
    wingspanCm: d.wingspanCm !== null ? String(d.wingspanCm) : "",
    guard: d.guard,
    laterality: d.laterality,
  };
}

const empty: Form = { sex: null, heightCm: "", weightKg: "", wingspanCm: "", guard: null, laterality: null };

export default function StudentPerfil() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);
  const [guardInfoOpen, setGuardInfoOpen] = useState<Guard | null>(null);
  const loadedRef = useRef(false);
  const [tocados, setTocados] = useState<Partial<Record<CampoNumerico, boolean>>>({});
  // Para onde ir depois de "Sair sem salvar": -1 = voltar; ou um caminho (o link do Perfil de Boxe).
  const [sairPara, setSairPara] = useState<string | number | null>(null);
  const irPara = (destino: string | number) => (mudou ? setSairPara(destino) : typeof destino === "number" ? navigate(destino) : navigate(destino));

  const { data: studentId, isError: erroId, refetch: recarregarId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const { data, isLoading, isError: erroDados, refetch: recarregarDados } = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: () => getStudentProfile(studentId!),
    enabled: !!studentId,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data && !loadedRef.current) {
      loadedRef.current = true;
      setForm(formDe(data));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveStudentProfile(studentId!, {
        sex: form.sex,
        heightCm: form.heightCm.trim() ? Number(form.heightCm.replace(",", ".")) : null,
        weightKg: form.weightKg.trim() ? Number(form.weightKg.replace(",", ".")) : null,
        wingspanCm: form.wingspanCm.trim() ? Number(form.wingspanCm.replace(",", ".")) : null,
        guard: form.guard,
        laterality: form.laterality,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-profile", studentId] });
      toast.success("Dados salvos");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
  });

  // O que está salvo (comparado por VALOR: "59,5" digitado e 59.5 salvo são o mesmo peso).
  const salvo = data ? formDe(data) : empty;
  const erros = {
    heightCm: erroDoCampo("heightCm", form.heightCm),
    weightKg: erroDoCampo("weightKg", form.weightKg),
    wingspanCm: erroDoCampo("wingspanCm", form.wingspanCm),
  };
  const invalido = Object.values(erros).some(Boolean);
  const mudou =
    form.sex !== salvo.sex ||
    form.guard !== salvo.guard ||
    form.laterality !== salvo.laterality ||
    parseNumero(form.heightCm) !== parseNumero(salvo.heightCm) ||
    parseNumero(form.weightKg) !== parseNumero(salvo.weightKg) ||
    parseNumero(form.wingspanCm) !== parseNumero(salvo.wingspanCm);

  // Fechar/recarregar a aba com alterações não salvas: o navegador pergunta. (Sair por dentro do app: o "voltar" do cabeçalho pergunta;
  // as abas de baixo não dá para interceptar — o app usa BrowserRouter, sem `useBlocker`.)
  useEffect(() => {
    if (!mudou) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [mudou]);

  if (isLoading || (!data && !erroId && !erroDados)) {
    return (
      <div className="page-container">
        <PageHeader title="MEUS DADOS FÍSICOS" back />
        <SkeletonCard height={280} />
      </div>
    );
  }

  // Antes, se a consulta falhava o formulário abria VAZIO como se o aluno nunca tivesse preenchido nada — e o "Salvar" gravava tudo em
  // branco por cima dos dados verdadeiros. Sem os dados carregados a tela não mostra formulário nenhum.
  if (erroId || erroDados) {
    return (
      <div className="page-container">
        <PageHeader title="MEUS DADOS FÍSICOS" back />
        <ErrorState
          title="Não foi possível carregar seus dados"
          description="Seus dados não foram alterados. Verifique sua conexão e tente novamente."
          onRetry={() => {
            if (erroId) recarregarId();
            if (erroDados) recarregarDados();
          }}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="MEUS DADOS FÍSICOS"
        subtitle="Opcional — deixe em branco o que preferir"
        back
        onBack={() => irPara(-1)}
      />

      {/* Por que pedimos, com o que é VERDADE hoje (conferido no código): o professor só vê o conjunto dos alunos (médias e contagens, na
          tela "Perfil dos alunos"), nunca o número de um aluno; altura e envergadura são usadas pelo Perfil de Boxe (versão completa). O
          subtítulo antigo, "ajuda seu professor a te conhecer melhor", prometia mais do que a tela do professor mostra. */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 mb-5 text-[13px] leading-snug text-muted-foreground">
        Seu professor vê só médias e contagens do conjunto dos alunos, não os seus números. Altura e envergadura também entram no cálculo do seu
        Perfil de Boxe.
      </div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Informações pessoais</div>
      <div className="mb-2.5">
        <Label>Sexo</Label>
        <div className="flex gap-2">
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <Pill key={s} label={SEX_LABELS[s]} on={form.sex === s} onClick={() => setForm((f) => ({ ...f, sex: f.sex === s ? null : s }))} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <Label htmlFor="height">Altura (cm)</Label>
          <Input
            id="height"
            inputMode="numeric"
            maxLength={3}
            value={form.heightCm}
            onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value.replace(/[^\d]/g, "") }))}
            onBlur={() => setTocados((t) => ({ ...t, heightCm: true }))}
            aria-invalid={!!(tocados.heightCm && erros.heightCm)}
            aria-describedby={tocados.heightCm && erros.heightCm ? "erro-height" : undefined}
            className={tocados.heightCm && erros.heightCm ? "border-destructive" : undefined}
            placeholder="165"
          />
          <ErroCampo id="erro-height" msg={tocados.heightCm ? erros.heightCm : null} />
        </div>
        <div>
          <Label htmlFor="weight">Peso (kg)</Label>
          <Input
            id="weight"
            inputMode="decimal"
            value={form.weightKg}
            onChange={(e) => setForm((f) => ({ ...f, weightKg: limpaPeso(e.target.value) }))}
            onBlur={() => setTocados((t) => ({ ...t, weightKg: true }))}
            aria-invalid={!!(tocados.weightKg && erros.weightKg)}
            aria-describedby={tocados.weightKg && erros.weightKg ? "erro-weight" : undefined}
            className={tocados.weightKg && erros.weightKg ? "border-destructive" : undefined}
            placeholder="59,5"
          />
          <ErroCampo id="erro-weight" msg={tocados.weightKg ? erros.weightKg : null} />
        </div>
      </div>
      <div className="mb-5">
        <Label htmlFor="wingspan">Envergadura (cm)</Label>
        <div className="text-[12px] text-muted-foreground mb-2.5 -mt-1">
          Distância entre as pontas dos dedos com os braços abertos. Opcional — usada no Perfil de Boxe (versão completa).
        </div>
        <Input
          id="wingspan"
          inputMode="numeric"
          maxLength={3}
          value={form.wingspanCm}
          onChange={(e) => setForm((f) => ({ ...f, wingspanCm: e.target.value.replace(/[^\d]/g, "") }))}
          onBlur={() => setTocados((t) => ({ ...t, wingspanCm: true }))}
          aria-invalid={!!(tocados.wingspanCm && erros.wingspanCm)}
          aria-describedby={tocados.wingspanCm && erros.wingspanCm ? "erro-wingspan" : undefined}
          className={tocados.wingspanCm && erros.wingspanCm ? "border-destructive" : undefined}
          placeholder="168"
        />
        <ErroCampo id="erro-wingspan" msg={tocados.wingspanCm ? erros.wingspanCm : null} />
      </div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Boxe</div>
      <div className="mb-5">
        <Label id="guarda-label">Guarda</Label>
        <div className="text-[12.5px] text-muted-foreground mb-2.5 -mt-1 leading-snug">
          Qual você considera a sua guarda principal? Não sabe? Pode deixar em branco. Lutando com o pé esquerdo à frente, costuma ser
          ortodoxa; com o direito, southpaw. Toque de novo na escolhida para desmarcar.
        </div>
        <div role="radiogroup" aria-labelledby="guarda-label" className="grid grid-cols-2 gap-2.5">
          {(Object.keys(GUARD_INFO) as Guard[]).map((g) => {
            const on = form.guard === g;
            return (
              <div
                key={g}
                className={cn(
                  "rounded-2xl border p-3.5 transition-all",
                  on ? "bg-primary/15 border-primary" : "bg-secondary border-border",
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm((f) => ({ ...f, guard: f.guard === g ? null : g }))}
                  className="w-full text-left rounded-lg active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className={cn("text-[13.5px] font-semibold mb-1", on ? "text-[hsl(var(--red-text))]" : "text-foreground")}>
                    {GUARD_INFO[g].label}
                  </div>
                  {/* 12px (eram 11px): o resumo é o que o iniciante lê para reconhecer a própria guarda. */}
                  <div className="text-xs text-muted-foreground leading-snug">{GUARD_INFO[g].summary}</div>
                </button>
                {/* Ajuda: alvo de 44px (eram 33px) e nome próprio — "O que é essa guarda?" repetido seis vezes não dizia qual. */}
                <button
                  type="button"
                  aria-label={`O que é a guarda ${GUARD_INFO[g].label}?`}
                  onClick={() => setGuardInfoOpen(g)}
                  className="mt-1.5 -mb-1.5 flex items-center gap-1.5 min-h-11 text-xs font-semibold text-accent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden /> O que é essa guarda?
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mb-6">
        <Label>Lateralidade</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LATERALITY_LABELS) as Laterality[]).map((l) => (
            <Pill
              key={l}
              label={LATERALITY_LABELS[l]}
              on={form.laterality === l}
              onClick={() => setForm((f) => ({ ...f, laterality: f.laterality === l ? null : l }))}
            />
          ))}
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={() => save.mutate()}
        disabled={save.isPending || !studentId || !data || !mudou || invalido}
        aria-describedby="salvar-motivo"
      >
        {save.isPending ? "Salvando…" : "Salvar"}
      </Button>
      {/* Botão desativado explica o motivo. */}
      <p id="salvar-motivo" className="text-[13px] text-muted-foreground text-center mt-2.5">
        {invalido ? "Corrija os campos em vermelho para salvar." : !mudou ? "Nenhuma alteração para salvar." : " "}
      </p>

      {/* O atalho para o Perfil de Boxe era um banner de 154px no TOPO (cordas, poste, anel girando, textos de 9px) que empurrava o
          formulário para a metade da tela e disputava com a ação da tela, que é preencher e salvar. Agora é uma linha discreta no fim. */}
      <button
        type="button"
        onClick={() => irPara("/app/perfil-lutador")}
        className="mt-8 w-full min-h-[52px] flex items-center gap-3 border-t border-border pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <Sparkles className="h-4 w-4 text-amber shrink-0" aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-foreground">Descobrir meu estilo de lutador</span>
          <span className="block text-[12.5px] text-muted-foreground">Responda o questionário do Perfil de Boxe</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      </button>

      <ConfirmDialog
        open={sairPara !== null}
        onOpenChange={(o) => !o && setSairPara(null)}
        title="SAIR SEM SALVAR?"
        description="Você mudou alguns dados e ainda não salvou. Se sair agora, as mudanças serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={() => {
          const destino = sairPara;
          setSairPara(null);
          if (typeof destino === "number") navigate(destino);
          else if (destino) navigate(destino);
        }}
      />

      <GuardInfoDialog guard={guardInfoOpen} onOpenChange={(o) => !o && setGuardInfoOpen(null)} />
    </div>
  );
}

function ErroCampo({ id, msg }: { id: string; msg: string | null }) {
  return (
    <div id={id} role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-1.5">
      {msg}
    </div>
  );
}

function Pill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 px-4 rounded-xl border text-[13.5px] font-semibold transition-all active:scale-95",
        on ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-border text-foreground/85",
      )}
    >
      {label}
    </button>
  );
}
