import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ARRIVAL_OPTIONS,
  GLOVE_SIZES,
  WRAP_LENGTHS,
  arrivalMessage,
  type ClassGuidelines,
  type EquipmentConfig,
} from "@/lib/classGuidelines";
import { getClassGuidelines, saveClassGuidelines } from "@/integrations/backend/api";

type Form = Omit<ClassGuidelines, "adminId">;

const empty: Form = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  referencePoint: "",
  // Sem valor padrão: antes "15" já vinha marcado e era GRAVADO mesmo que o professor nunca o escolhesse (o aluno passava a ver "chegue
  // 15 minutos antes" sem ninguém ter decidido isso).
  arrivalMinutes: null,
  equipment: {},
  notes: "",
};

function formDe(d: ClassGuidelines): Form {
  return {
    cep: d.cep ?? "",
    street: d.street ?? "",
    number: d.number ?? "",
    complement: d.complement ?? "",
    neighborhood: d.neighborhood ?? "",
    city: d.city ?? "",
    state: d.state ?? "",
    referencePoint: d.referencePoint ?? "",
    arrivalMinutes: d.arrivalMinutes ?? null,
    equipment: d.equipment ?? {},
    notes: d.notes ?? "",
  };
}

/** Chave para comparar formulário x salvo: sem espaços nas pontas e com listas ordenadas (marcar e desmarcar um tamanho muda a ordem). */
function chaveDe(f: Form): string {
  const t = (v: string | null) => (v ?? "").trim();
  const eq = f.equipment;
  return JSON.stringify({
    ...f,
    cep: t(f.cep), street: t(f.street), number: t(f.number), complement: t(f.complement), neighborhood: t(f.neighborhood),
    city: t(f.city), state: t(f.state), referencePoint: t(f.referencePoint), notes: t(f.notes),
    equipment: {
      gloves: eq.gloves ? { level: eq.gloves.level, sizes: [...eq.gloves.sizes].sort() } : null,
      wraps: eq.wraps ? { level: eq.wraps.level, lengths: [...eq.wraps.lengths].sort() } : null,
      mouthguard: !!eq.mouthguard, groinGuard: !!eq.groinGuard, headgear: !!eq.headgear, shinGuards: !!eq.shinGuards,
    },
  });
}

/** "41810010" → "41810-010" (só dígitos, no máximo 8). */
function mascaraCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Campos que a busca de CEP preenche. */
type CampoDoCep = "street" | "neighborhood" | "city" | "state";

function toggleSize(list: string[], size: string) {
  return list.includes(size) ? list.filter((s) => s !== size) : [...list, size];
}

export default function AdminOrientacoesAula() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(empty);
  const [sairOpen, setSairOpen] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  // ids únicos por instância (a galeria mostra a tela várias vezes na mesma página).
  const idNumero = useId();
  const idCepMsg = useId();
  // Campos que a busca de CEP preencheu e o professor ainda não mexeu: só esses (e os vazios) são trocados numa nova busca.
  const veioDoCep = useRef<Set<CampoDoCep>>(new Set());
  // Sem isso, o React Query padrão refaz a busca sempre que a aba/teclado reganha foco — o que é
  // comum ao alternar entre campos no celular — e o useEffect abaixo sobrescrevia o que o
  // professor tinha acabado de digitar com o dado antigo do servidor. Uma vez carregado, o
  // formulário local é a fonte da verdade até "Salvar".
  const loadedRef = useRef(false);

  const { data, isSuccess, isError, refetch } = useQuery({
    queryKey: ["class-guidelines", profile?.id],
    queryFn: () => getClassGuidelines(profile!.id),
    enabled: !!profile,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data && !loadedRef.current) {
      loadedRef.current = true;
      setForm(formDe(data));
    }
  }, [data]);

  async function lookupCep() {
    const digits = (form.cep ?? "").replace(/\D/g, "");
    setCepMsg(null);
    if (digits.length === 0) return;
    if (digits.length !== 8) {
      setCepMsg("O CEP tem 8 números.");
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const found = await res.json();
      if (found.erro) {
        setCepMsg("CEP não encontrado. Preencha o endereço à mão.");
        return;
      }
      const chegou: Record<CampoDoCep, string> = {
        street: found.logradouro ?? "",
        neighborhood: found.bairro ?? "",
        city: found.localidade ?? "",
        state: found.uf ?? "",
      };
      // Antes o CEP SOBRESCREVIA rua/bairro/cidade/estado já digitados (uma correção à mão sumia). Agora só entram os campos vazios ou
      // que a própria busca preencheu antes e o professor não editou.
      setForm((f) => {
        const next = { ...f };
        (Object.keys(chegou) as CampoDoCep[]).forEach((c) => {
          if (chegou[c] && (!(f[c] ?? "").trim() || veioDoCep.current.has(c))) {
            next[c] = chegou[c];
            veioDoCep.current.add(c);
          }
        });
        return next;
      });
      // Com o endereço preenchido, o que falta é o número: leva o foco até ele.
      document.getElementById(idNumero)?.focus();
    } catch {
      setCepMsg("Não consegui buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setCepLoading(false);
    }
  }

  /** Editar à mão um campo que veio do CEP o "solta": uma nova busca não o troca. */
  function editaCampo(c: CampoDoCep, v: string) {
    veioDoCep.current.delete(c);
    setForm((f) => ({ ...f, [c]: v }));
  }

  const save = useMutation({
    mutationFn: () => saveClassGuidelines(profile!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-guidelines", profile?.id] });
      setSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      toast.success("Orientações salvas");
    },
    // Frase em português (antes o toast mostrava o texto cru do banco). O que o professor digitou continua na tela.
    onError: () => toast.error("Não foi possível salvar. Verifique sua conexão e tente de novo — o que você digitou continua aqui."),
  });

  function setEquipment(patch: Partial<EquipmentConfig>) {
    setForm((f) => ({ ...f, equipment: { ...f.equipment, ...patch } }));
  }

  // ATENÇÃO (regra dos hooks): estes dois ficam ACIMA dos `return` antecipados de erro/carregando. Um hook depois deles muda a
  // quantidade de hooks entre o esqueleto e a tela pronta e o React lança "Rendered more hooks than during the previous render".
  // O que está salvo (`data === null` = nunca salvou: comparar com o vazio). Salvar só vale quando algo mudou.
  const mudou = chaveDe(form) !== chaveDe(data ? formDe(data) : empty);

  // Fechar/recarregar a aba com alterações não salvas: o navegador pergunta. Sair pelo "voltar" do cabeçalho: janela própria. (As abas de
  // baixo do app não dá para interceptar — o app usa BrowserRouter, sem `useBlocker`.)
  useEffect(() => {
    if (!mudou) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [mudou]);

  // Antes só existia `isLoading`: se a consulta FALHAVA o formulário abria VAZIO (indistinguível de "nunca preencheu") e o "Salvar
  // orientações" gravava tudo em branco por cima do endereço, equipamento e recado que os alunos veem no detalhe da aula. Agora, sem a
  // resposta do servidor (`isSuccess`; `data === null` é "nunca salvou" e é uma resposta válida) a tela não mostra formulário.
  if (isError) {
    return (
      <div className="page-container">
        <PageHeader title="ORIENTAÇÕES DA AULA" subtitle="Padrão mostrado aos alunos" back />
        <ErrorState
          title="Não foi possível carregar as orientações"
          description="O que você já salvou não foi alterado. Verifique sua conexão e tente novamente."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!isSuccess) {
    return (
      <div className="page-container">
        <PageHeader title="ORIENTAÇÕES DA AULA" subtitle="Padrão mostrado aos alunos" back />
        <SkeletonCard height={280} />
      </div>
    );
  }

  const eq = form.equipment;
  return (
    <div className="page-container">
      <PageHeader
        title="ORIENTAÇÕES DA AULA"
        subtitle="Padrão mostrado aos alunos nos detalhes de cada aula"
        back
        onBack={() => (mudou ? setSairOpen(true) : navigate(-1))}
      />

      <Section title="Local da aula">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="relative">
            <Field
              label="CEP"
              value={form.cep}
              onChange={(v) => {
                setCepMsg(null);
                setForm((f) => ({ ...f, cep: mascaraCep(v) }));
              }}
              onBlur={lookupCep}
              placeholder="41000-000"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={9}
              erroId={cepMsg ? idCepMsg : undefined}
            />
            {cepLoading && (
              <div role="status" className="absolute right-3 bottom-3.5 text-xs text-muted-foreground">
                buscando…
              </div>
            )}
          </div>
          <Field
            id={idNumero}
            label="Número"
            value={form.number}
            onChange={(v) => setForm((f) => ({ ...f, number: v }))}
            placeholder="123 ou S/N"
            inputMode="text"
            autoComplete="off"
            maxLength={10}
          />
        </div>
        {cepMsg && (
          <div id={idCepMsg} role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] -mt-1.5 mb-3">
            {cepMsg}
          </div>
        )}
        <Field
          label="Rua"
          value={form.street}
          onChange={(v) => editaCampo("street", v)}
          placeholder="Rua das Palmeiras"
          autoComplete="address-line1"
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Complemento" value={form.complement} onChange={(v) => setForm((f) => ({ ...f, complement: v }))} placeholder="Sala 2" autoComplete="address-line2" />
          <Field label="Bairro" value={form.neighborhood} onChange={(v) => editaCampo("neighborhood", v)} placeholder="Centro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade" value={form.city} onChange={(v) => editaCampo("city", v)} placeholder="Salvador" autoComplete="address-level2" />
          <Field
            label="Estado"
            value={form.state}
            onChange={(v) => editaCampo("state", v.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase())}
            placeholder="BA"
            autoComplete="address-level1"
            maxLength={2}
          />
        </div>
      </Section>

      <Section title="Ponto de referência">
        <Textarea
          aria-label="Ponto de referência"
          maxLength={200}
          value={form.referencePoint ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, referencePoint: e.target.value }))}
          placeholder="Entrada ao lado do estacionamento do mercado."
          className="h-16 border-muted-foreground/70"
        />
      </Section>

      <Section title="Antecedência recomendada" titleId="antecedencia-titulo">
        {/* Quebra de linha em vez de rolagem lateral: em 375px "20 min" e "30 min" ficavam escondidos fora da vista. */}
        <div role="group" aria-labelledby="antecedencia-titulo" className="flex flex-wrap gap-2">
          {ARRIVAL_OPTIONS.map((min) => {
            const on = form.arrivalMinutes === min;
            return (
              <button
                key={min}
                type="button"
                aria-pressed={on}
                // Tocar de novo na marcada desmarca: sem isso não havia como voltar a "não avisar antecedência".
                onClick={() => setForm((f) => ({ ...f, arrivalMinutes: f.arrivalMinutes === min ? null : min }))}
                className={cn(
                  "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? PILL_ON : PILL_OFF,
                )}
              >
                {min} min
              </button>
            );
          })}
        </div>
        <div className="text-[12.5px] text-muted-foreground mt-2.5">
          {arrivalMessage(form.arrivalMinutes)
            ? `O aluno vê: “${arrivalMessage(form.arrivalMinutes)}”`
            : "Nenhuma marcada: o aluno não vê aviso de antecedência. Toque de novo na escolhida para desmarcar."}
        </div>
      </Section>

      <Section title="Equipamentos recomendados">
        <EquipmentGroup
          title="Luvas"
          level={eq.gloves?.level}
          onLevel={(level) => setEquipment({ gloves: level ? { level, sizes: eq.gloves?.sizes ?? [] } : undefined })}
        >
          {eq.gloves && (
            <SizePills
              label="Tamanhos de luva"
              options={GLOVE_SIZES}
              selected={eq.gloves.sizes}
              onToggle={(s) => setEquipment({ gloves: { ...eq.gloves!, sizes: toggleSize(eq.gloves!.sizes, s) } })}
            />
          )}
        </EquipmentGroup>

        <EquipmentGroup
          title="Bandagem"
          level={eq.wraps?.level}
          onLevel={(level) => setEquipment({ wraps: level ? { level, lengths: eq.wraps?.lengths ?? [] } : undefined })}
        >
          {eq.wraps && (
            <SizePills
              label="Comprimentos de bandagem"
              options={WRAP_LENGTHS}
              selected={eq.wraps.lengths}
              onToggle={(s) => setEquipment({ wraps: { ...eq.wraps!, lengths: toggleSize(eq.wraps!.lengths, s) } })}
            />
          )}
        </EquipmentGroup>

        <div id="protecoes-titulo" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mt-4 mb-2">Proteções</div>
        <div role="group" aria-labelledby="protecoes-titulo" className="flex flex-wrap gap-2">
          <TogglePill mode="toggle" label="Protetor bucal" on={!!eq.mouthguard} onClick={() => setEquipment({ mouthguard: !eq.mouthguard })} />
          <TogglePill mode="toggle" label="Coquilha" on={!!eq.groinGuard} onClick={() => setEquipment({ groinGuard: !eq.groinGuard })} />
          <TogglePill mode="toggle" label="Capacete" on={!!eq.headgear} onClick={() => setEquipment({ headgear: !eq.headgear })} />
          <TogglePill mode="toggle" label="Caneleiras" on={!!eq.shinGuards} onClick={() => setEquipment({ shinGuards: !eq.shinGuards })} />
        </div>
      </Section>

      <Section title="Outros">
        <Textarea
          aria-label="Outras orientações para o aluno"
          maxLength={500}
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Traga garrafa de água e uma toalha."
          className="h-16 border-muted-foreground/70"
        />
      </Section>

      <Button
        size="lg"
        className="w-full mt-2"
        onClick={() => save.mutate()}
        disabled={save.isPending || !isSuccess || !mudou}
        aria-describedby="salvar-motivo"
      >
        {save.isPending ? "Salvando…" : "Salvar orientações"}
      </Button>
      {/* Botão desativado explica o motivo; depois de salvar, diz que salvou (antes só um aviso que some). */}
      <p id="salvar-motivo" role="status" className="text-[13px] text-muted-foreground text-center mt-2.5">
        {mudou ? "\u00a0" : salvoEm ? `Salvo às ${salvoEm}. Os alunos já veem estas orientações.` : "Nenhuma alteração para salvar."}
      </p>

      <ConfirmDialog
        open={sairOpen}
        onOpenChange={setSairOpen}
        title="SAIR SEM SALVAR?"
        description="Você mudou alguma orientação e ainda não salvou. Se sair agora, as mudanças serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        onConfirm={() => navigate(-1)}
      />
    </div>
  );
}

// Marcada: vermelho de TEXTO (o vermelho de destaque dava 3,25:1 sobre o fundo) e contorno; desmarcada: contorno legível (era #333, 1,4:1).
const PILL_ON = "bg-primary/15 border-primary text-[hsl(var(--red-text))]";
const PILL_OFF = "bg-secondary border-muted-foreground/60 text-foreground/85";

function Section({ title, titleId, children }: { title: string; titleId?: string; children: React.ReactNode }) {
  return (
    <div className="card-dark p-4 mb-3.5">
      <h2 id={titleId} className="section-title mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  autoComplete,
  inputMode,
  onBlur,
  maxLength,
  erroId,
}: {
  id?: string;
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric";
  onBlur?: () => void;
  maxLength?: number;
  /** id da mensagem de erro deste campo (liga ao input por aria-describedby). */
  erroId?: string;
}) {
  // Antes o <Label> não tinha htmlFor e o input não tinha id: nenhum dos campos tinha nome para o leitor de tela.
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <Label htmlFor={fid}>{label}</Label>
      <Input
        id={fid}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={erroId ? true : undefined}
        aria-describedby={erroId}
        className="border-muted-foreground/70"
      />
    </div>
  );
}

function EquipmentGroup({
  title,
  level,
  onLevel,
  children,
}: {
  title: string;
  level: "required" | "recommended" | undefined;
  onLevel: (level: "required" | "recommended" | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div id={`nivel-${title}`} className="text-[14.5px] font-semibold text-foreground mb-2">{title}</div>
      <div role="radiogroup" aria-labelledby={`nivel-${title}`} className="flex flex-wrap gap-2 mb-2.5">
        <TogglePill mode="radio" label="Não recomendado" on={!level} onClick={() => onLevel(null)} />
        <TogglePill mode="radio" label="Recomendado" on={level === "recommended"} onClick={() => onLevel("recommended")} />
        <TogglePill mode="radio" label="Obrigatório" on={level === "required"} onClick={() => onLevel("required")} />
      </div>
      {children}
    </div>
  );
}

function SizePills({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (s: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <TogglePill key={opt} mode="toggle" label={opt} on={selected.includes(opt)} onClick={() => onToggle(opt)} />
      ))}
    </div>
  );
}

/** `radio` = escolha única (o estado vai em `aria-checked`); `toggle` = liga/desliga (`aria-pressed`). Antes o estado era só a cor. */
function TogglePill({ label, on, onClick, mode }: { label: string; on: boolean; onClick: () => void; mode: "radio" | "toggle" }) {
  return (
    <button
      type="button"
      {...(mode === "radio" ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })}
      onClick={onClick}
      className={cn(
        "h-11 px-3.5 rounded-xl border text-[13px] font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? PILL_ON : PILL_OFF,
      )}
    >
      {label}
    </button>
  );
}
