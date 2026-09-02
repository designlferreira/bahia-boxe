import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
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
  arrivalMinutes: 15,
  equipment: {},
  notes: "",
};

function toggleSize(list: string[], size: string) {
  return list.includes(size) ? list.filter((s) => s !== size) : [...list, size];
}

export default function AdminOrientacoesAula() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  const { data, isLoading } = useQuery({
    queryKey: ["class-guidelines", profile?.id],
    queryFn: () => getClassGuidelines(profile!.id),
    enabled: !!profile,
  });

  useEffect(() => {
    if (data) {
      setForm({
        cep: data.cep ?? "",
        street: data.street ?? "",
        number: data.number ?? "",
        complement: data.complement ?? "",
        neighborhood: data.neighborhood ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        referencePoint: data.referencePoint ?? "",
        arrivalMinutes: data.arrivalMinutes ?? 15,
        equipment: data.equipment ?? {},
        notes: data.notes ?? "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveClassGuidelines(profile!.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-guidelines", profile?.id] });
      toast.success("Orientações salvas");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
  });

  function setEquipment(patch: Partial<EquipmentConfig>) {
    setForm((f) => ({ ...f, equipment: { ...f.equipment, ...patch } }));
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="ORIENTAÇÕES DA AULA" subtitle="Padrão mostrado aos alunos" back />
        <SkeletonCard height={280} />
      </div>
    );
  }

  const eq = form.equipment;

  return (
    <div className="page-container pb-8">
      <PageHeader title="ORIENTAÇÕES DA AULA" subtitle="Padrão mostrado aos alunos nos detalhes de cada aula" back />

      <Section title="Local da aula">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="CEP" value={form.cep} onChange={(v) => setForm((f) => ({ ...f, cep: v }))} placeholder="41000-000" />
          <Field label="Número" value={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} placeholder="123" />
        </div>
        <Field label="Rua" value={form.street} onChange={(v) => setForm((f) => ({ ...f, street: v }))} placeholder="Rua das Palmeiras" className="mb-3" />
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Complemento" value={form.complement} onChange={(v) => setForm((f) => ({ ...f, complement: v }))} placeholder="Sala 2" />
          <Field label="Bairro" value={form.neighborhood} onChange={(v) => setForm((f) => ({ ...f, neighborhood: v }))} placeholder="Centro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Salvador" />
          <Field label="Estado" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="BA" />
        </div>
      </Section>

      <Section title="Ponto de referência">
        <Textarea
          value={form.referencePoint ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, referencePoint: e.target.value }))}
          placeholder="Entrada ao lado do estacionamento do mercado."
          className="h-16"
        />
      </Section>

      <Section title="Antecedência recomendada">
        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scroll-fade-x">
          {ARRIVAL_OPTIONS.map((min) => {
            const on = form.arrivalMinutes === min;
            return (
              <button
                key={min}
                type="button"
                onClick={() => setForm((f) => ({ ...f, arrivalMinutes: min }))}
                className={cn(
                  "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                  on ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                )}
              >
                {min} min
              </button>
            );
          })}
        </div>
        {arrivalMessage(form.arrivalMinutes) && (
          <div className="text-[12.5px] text-muted-foreground mt-2.5">
            O aluno vê: “{arrivalMessage(form.arrivalMinutes)}”
          </div>
        )}
      </Section>

      <Section title="Equipamentos recomendados">
        <EquipmentGroup
          title="Luvas"
          level={eq.gloves?.level}
          onLevel={(level) => setEquipment({ gloves: level ? { level, sizes: eq.gloves?.sizes ?? [] } : undefined })}
        >
          {eq.gloves && (
            <SizePills
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
              options={WRAP_LENGTHS}
              selected={eq.wraps.lengths}
              onToggle={(s) => setEquipment({ wraps: { ...eq.wraps!, lengths: toggleSize(eq.wraps!.lengths, s) } })}
            />
          )}
        </EquipmentGroup>

        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mt-4 mb-2">Proteções</div>
        <div className="flex flex-wrap gap-2">
          <TogglePill label="Protetor bucal" on={!!eq.mouthguard} onClick={() => setEquipment({ mouthguard: !eq.mouthguard })} />
          <TogglePill label="Coquilha" on={!!eq.groinGuard} onClick={() => setEquipment({ groinGuard: !eq.groinGuard })} />
          <TogglePill label="Capacete" on={!!eq.headgear} onClick={() => setEquipment({ headgear: !eq.headgear })} />
          <TogglePill label="Caneleiras" on={!!eq.shinGuards} onClick={() => setEquipment({ shinGuards: !eq.shinGuards })} />
        </div>
      </Section>

      <Section title="Outros">
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Traga garrafa de água e uma toalha."
          className="h-16"
        />
      </Section>

      <Button size="lg" className="w-full mt-2" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Salvando…" : "Salvar orientações"}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-dark p-4 mb-3.5">
      <div className="font-display text-lg tracking-wide text-foreground mb-3">{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
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
      <div className="text-[14.5px] font-semibold text-foreground mb-2">{title}</div>
      <div className="flex gap-2 mb-2.5">
        <TogglePill label="Não recomendado" on={!level} onClick={() => onLevel(null)} />
        <TogglePill label="Recomendado" on={level === "recommended"} onClick={() => onLevel("recommended")} />
        <TogglePill label="Obrigatório" on={level === "required"} onClick={() => onLevel("required")} />
      </div>
      {children}
    </div>
  );
}

function SizePills({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <TogglePill key={opt} label={opt} on={selected.includes(opt)} onClick={() => onToggle(opt)} />
      ))}
    </div>
  );
}

function TogglePill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 px-3.5 rounded-xl border text-[13px] font-semibold transition-all active:scale-95",
        on ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/80",
      )}
    >
      {label}
    </button>
  );
}
