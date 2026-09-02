import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HelpCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
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
  guard: Guard | null;
  laterality: Laterality | null;
}

const empty: Form = { sex: null, heightCm: "", weightKg: "", guard: null, laterality: null };

export default function StudentPerfil() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);
  const [guardInfoOpen, setGuardInfoOpen] = useState<Guard | null>(null);
  const loadedRef = useRef(false);

  const { data: studentId } = useQuery({
    queryKey: ["my-student-id", profile?.id],
    queryFn: () => studentIdForProfile(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["student-profile", studentId],
    queryFn: () => getStudentProfile(studentId!),
    enabled: !!studentId,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data && !loadedRef.current) {
      loadedRef.current = true;
      setForm({
        sex: data.sex,
        heightCm: data.heightCm !== null ? String(data.heightCm) : "",
        weightKg: data.weightKg !== null ? String(data.weightKg) : "",
        guard: data.guard,
        laterality: data.laterality,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveStudentProfile(studentId!, {
        sex: form.sex,
        heightCm: form.heightCm.trim() ? Number(form.heightCm.replace(",", ".")) : null,
        weightKg: form.weightKg.trim() ? Number(form.weightKg.replace(",", ".")) : null,
        guard: form.guard,
        laterality: form.laterality,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-profile", studentId] });
      toast.success("Perfil atualizado");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="PERFIL FÍSICO E DE BOXE" back />
        <SkeletonCard height={280} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader title="PERFIL FÍSICO E DE BOXE" subtitle="Opcional — ajuda seu professor a te conhecer melhor" back />

      <button
        type="button"
        onClick={() => navigate("/app/perfil-lutador")}
        className="w-full text-left relative overflow-hidden rounded-[20px] p-5 mb-5 bg-[linear-gradient(135deg,#1F1B0C_0%,#171717_65%)] border border-amber/30 active:scale-[0.99] transition-transform animate-bb-up"
      >
        <div className="absolute -right-6 -top-6 w-[140px] h-[140px] rounded-full bg-[radial-gradient(circle,hsl(var(--amber)/0.22),transparent_70%)] animate-bb-pulse" />
        <div className="relative flex items-center gap-1.5 text-amber text-[11px] font-bold uppercase tracking-wide mb-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Descubra seu perfil de lutador
        </div>
        <div className="relative text-[15px] font-semibold text-foreground mb-1">
          Pressure Fighter, Out-Boxer, Boxer-Puncher ou Counter Puncher?
        </div>
        <div className="relative text-[12.5px] text-muted-foreground">Fazer teste</div>
      </button>

      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Informações pessoais</div>
      <div className="mb-2.5">
        <Label>Sexo</Label>
        <div className="flex gap-2">
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <Pill key={s} label={SEX_LABELS[s]} on={form.sex === s} onClick={() => setForm((f) => ({ ...f, sex: f.sex === s ? null : s }))} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <Label htmlFor="height">Altura (cm)</Label>
          <Input
            id="height"
            inputMode="numeric"
            value={form.heightCm}
            onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="165"
          />
        </div>
        <div>
          <Label htmlFor="weight">Peso (kg)</Label>
          <Input
            id="weight"
            inputMode="decimal"
            value={form.weightKg}
            onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value.replace(/[^\d.,]/g, "") }))}
            placeholder="59.5"
          />
        </div>
      </div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Boxe</div>
      <div className="mb-5">
        <Label>Guarda</Label>
        <div className="text-[12px] text-muted-foreground mb-2.5 -mt-1">Qual você considera a sua guarda principal?</div>
        <div className="grid grid-cols-2 gap-2.5">
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
                  onClick={() => setForm((f) => ({ ...f, guard: f.guard === g ? null : g }))}
                  className="w-full text-left active:scale-[0.98] transition-transform"
                >
                  <div className={cn("text-[13.5px] font-semibold mb-1", on ? "text-primary" : "text-foreground")}>
                    {GUARD_INFO[g].label}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{GUARD_INFO[g].summary}</div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGuardInfoOpen(g);
                  }}
                  className="mt-2.5 flex items-center gap-1 min-h-8 text-[11px] font-semibold text-accent"
                >
                  <HelpCircle className="h-3 w-3" /> O que é essa guarda?
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

      <Button size="lg" className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !studentId}>
        {save.isPending ? "Salvando…" : "Salvar"}
      </Button>

      <GuardInfoDialog guard={guardInfoOpen} onOpenChange={(o) => !o && setGuardInfoOpen(null)} />
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
