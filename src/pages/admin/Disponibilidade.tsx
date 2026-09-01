import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteAvailabilitySlot,
  getAvailability,
  restoreAvailabilitySlot,
  saveAvailabilitySlot,
  toggleAvailabilityDay,
} from "@/integrations/backend/api";
import type { AvailabilitySlot } from "@/integrations/backend/types";

const START_HOURS = [6, 7, 8, 9, 10, 17, 18, 19, 20];
const END_HOURS = [7, 8, 9, 10, 11, 18, 19, 20, 21];
const hhmm = (h: number) => String(h).padStart(2, "0") + ":00";

interface EditorState {
  weekday: number;
  dayName: string;
  id: string | null;
  start: string;
  end: string;
}

export default function AdminDisponibilidade() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ weekday: number; name: string; booked: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ slot: AvailabilitySlot; dayName: string; booked: number } | null>(null);

  const key = ["availability", profile?.id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getAvailability(profile!.id),
    enabled: !!profile,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: key });
  }

  const toggleDay = useMutation({
    mutationFn: ({ weekday, active }: { weekday: number; active: boolean }) => toggleAvailabilityDay(profile!.id, weekday, active),
    onSuccess: (_r, vars) => {
      invalidate();
      toast(vars.active ? `Dia disponível para agendamento` : `Dia indisponível para novos agendamentos`, {
        className: vars.active ? undefined : "!text-amber",
      });
    },
  });

  const saveSlot = useMutation({
    mutationFn: (e: EditorState) => saveAvailabilitySlot(profile!.id, e.weekday, e.start, e.end, e.id),
    onSuccess: (result, vars) => {
      if (result.error) {
        setEditorError(result.error);
        return;
      }
      invalidate();
      setEditor(null);
      setEditorError(null);
      toast.success(vars.id ? "Horário atualizado" : `Horário adicionado em ${vars.dayName}`);
    },
  });

  const deleteSlot = useMutation({
    mutationFn: (slot: AvailabilitySlot) => deleteAvailabilitySlot(slot.id),
    onSuccess: (_r, slot) => {
      invalidate();
      toast.warning("Horário removido", {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            await restoreAvailabilitySlot(slot);
            invalidate();
          },
        },
      });
    },
  });

  if (!profile) return null;

  const totalSlots = data?.reduce((n, d) => n + d.slots.length, 0) ?? 0;
  const totalDays = data?.filter((d) => d.active && d.slots.length > 0).length ?? 0;

  return (
    <div className="page-container">
      <PageHeader title="MINHA DISPONIBILIDADE" subtitle="Grade semanal recorrente" back />

      <div className="rounded-[18px] px-4 py-3.5 mb-4 bg-[linear-gradient(150deg,#1F1B0C,#171717_62%)] border border-[#35301A] flex items-center gap-3.5">
        <div>
          <div className="font-display text-[34px] leading-[0.9] text-accent">{totalSlots}</div>
          <div className="text-[11px] uppercase tracking-wide text-accent/70">intervalos</div>
        </div>
        <div className="w-px h-9 bg-[#2E2A1A]" />
        <div className="flex-1 text-[12.5px] text-foreground/80 leading-snug">
          Alunos podem agendar em <strong className="text-foreground">{totalDays} dias</strong> da semana. Aulas já
          marcadas não são afetadas por mudanças aqui.
        </div>
      </div>

      {isError && <ErrorState title="Não foi possível carregar a disponibilidade" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={112} />}

      {!isLoading && !isError && data && (
        <div className="flex flex-col gap-3">
          {data.map((day) => (
            <div key={day.weekday} className="card-dark p-[15px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <div className={cn("text-[15px] font-semibold", day.active ? "text-foreground" : "text-muted-foreground")}>
                    {day.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {!day.active
                      ? "Indisponível"
                      : day.slots.length === 0
                        ? "Sem horários"
                        : `${day.slots.length} intervalo(s)`}
                  </div>
                </div>
                <Switch
                  aria-label="Alternar disponibilidade do dia"
                  checked={day.active}
                  onCheckedChange={(checked) => {
                    const booked = day.slots.reduce((n, s) => n + s.bookedCount, 0);
                    if (day.active && !checked && booked > 0) {
                      setConfirmDeactivate({ weekday: day.weekday, name: day.name, booked });
                    } else {
                      toggleDay.mutate({ weekday: day.weekday, active: checked });
                    }
                  }}
                />
              </div>

              {day.active && day.slots.length > 0 && (
                <div className="flex flex-col gap-2 mb-2.5">
                  {day.slots.map((slot) => {
                    const booked = slot.bookedCount;
                    return (
                      <div key={slot.id} className="flex items-center gap-2.5 p-2.5 rounded-[13px] bg-[#141414] border border-[#262626]">
                        <div className="flex-1">
                          <div className="text-[14.5px] font-semibold text-foreground">
                            {slot.startTime} – {slot.endTime}
                          </div>
                          <div className={cn("text-[11.5px] mt-0.5", booked > 0 ? "text-amber" : "text-muted-foreground")}>
                            {booked > 0 ? `${booked} aula(s) marcada(s) neste intervalo` : "Aberto para agendamento"}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Editar horário"
                          onClick={() => {
                            setEditor({ weekday: day.weekday, dayName: day.name, id: slot.id, start: slot.startTime, end: slot.endTime });
                            setEditorError(null);
                          }}
                          className="h-11 w-11 rounded-[10px] border border-[#333] bg-secondary flex items-center justify-center active:scale-95"
                        >
                          <Pencil className="h-[15px] w-[15px] text-foreground/80" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remover horário"
                          onClick={() =>
                            booked > 0
                              ? setConfirmDelete({ slot, dayName: day.name, booked })
                              : deleteSlot.mutate(slot)
                          }
                          className="h-11 w-11 rounded-[10px] border border-destructive/35 bg-destructive/10 flex items-center justify-center active:scale-95"
                        >
                          <Trash2 className="h-[15px] w-[15px] text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {day.active && day.slots.length === 0 && (
                <div className="border border-dashed border-[#2E2E2E] rounded-[13px] p-4 text-center mb-2.5">
                  <div className="text-[12.5px] text-muted-foreground">
                    Nenhum intervalo — alunos não conseguem agendar neste dia.
                  </div>
                </div>
              )}

              <Button
                variant="secondary"
                className="w-full h-11 hover:border-primary hover:text-primary"
                onClick={() => {
                  setEditor({ weekday: day.weekday, dayName: day.name, id: null, start: "06:00", end: "09:00" });
                  setEditorError(null);
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar horário
              </Button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        {editor && (
          <SheetContent>
            <SheetTitle>{editor.id ? "EDITAR HORÁRIO" : "ADICIONAR HORÁRIO"}</SheetTitle>
            <div className="text-[13px] text-muted-foreground mb-4">{editor.dayName} · repete toda semana</div>

            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Início</div>
            <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
              {START_HOURS.map((h) => {
                const v = hhmm(h);
                const on = editor.start === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEditor({ ...editor, start: v })}
                    className={cn(
                      "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                      on ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>

            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Fim</div>
            <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
              {END_HOURS.map((h) => {
                const v = hhmm(h);
                const on = editor.end === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEditor({ ...editor, end: v })}
                    className={cn(
                      "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                      on ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>

            {editorError && (
              <div className="rounded-[13px] border border-destructive/35 bg-destructive/10 p-3 mb-3.5 text-[12.5px] text-destructive">
                {editorError}
              </div>
            )}

            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => setEditor(null)}>
                Voltar
              </Button>
              <Button size="lg" className="flex-[1.4]" onClick={() => saveSlot.mutate(editor)} disabled={saveSlot.isPending}>
                {editor.id ? "Salvar alterações" : "Adicionar horário"}
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDeactivate}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title={`DESATIVAR ${confirmDeactivate?.name.toUpperCase() ?? ""}`}
        description={`Há ${confirmDeactivate?.booked} aula(s) já marcada(s) nesse dia. Elas continuam válidas, mas o dia deixa de aceitar novos agendamentos.`}
        confirmLabel="Desativar"
        onConfirm={() => confirmDeactivate && toggleDay.mutate({ weekday: confirmDeactivate.weekday, active: false })}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="REMOVER HORÁRIO"
        description={`Há ${confirmDelete?.booked} aula(s) marcada(s) nesse intervalo em ${confirmDelete?.dayName}. Remover o intervalo não cancela essas aulas, mas bloqueia novos agendamentos.`}
        confirmLabel="Remover"
        onConfirm={() => confirmDelete && deleteSlot.mutate(confirmDelete.slot)}
      />
    </div>
  );
}
