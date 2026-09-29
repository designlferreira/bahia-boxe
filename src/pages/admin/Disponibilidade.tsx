import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  deleteAvailabilityInterval,
  getAdminSettings,
  getAvailability,
  HORIZON_WEEKS,
  restoreAvailabilityInterval,
  saveAvailabilityInterval,
  toggleAvailabilityDay,
} from "@/integrations/backend/api";
import type { AvailabilityInterval } from "@/integrations/backend/types";
import { mensagemDeErro } from "@/lib/erros";

/** Horas de treino razoáveis (05h–22h início, 06h–23h fim) — o resto (madrugada) só aparece se o horário JÁ existe. */
const START_MIN = 5;
const START_MAX = 22;
const END_MIN = 6;
const END_MAX = 23;
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const hhmm = (h: number) => String(h).padStart(2, "0") + ":00";
const horaDe = (v: string) => parseInt(v.slice(0, 2), 10);

function faixa(min: number, max: number, extras: number[]): number[] {
  const set = new Set<number>();
  for (let h = min; h <= max; h++) set.add(h);
  for (const h of extras) set.add(h);
  return [...set].sort((a, b) => a - b);
}

interface HoraChipsProps {
  label: string;
  horas: number[];
  selecionada: string;
  desabilitada: (h: number) => boolean;
  onPick: (v: string) => void;
}

/** Fileira de horas: marca a escolhida (`aria-pressed`), apaga as que não servem e já rola até a escolhida. */
function HoraChips({ label, horas, selecionada, desabilitada, onPick }: HoraChipsProps) {
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // O escolhido pode estar fora da vista (a fileira rola): traz pra dentro ao abrir.
    const t = window.setTimeout(() => selRef.current?.scrollIntoView({ inline: "center", block: "nearest" }), 60);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <>
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">{label}</div>
      <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
        {horas.map((h) => {
          const v = hhmm(h);
          const on = selecionada === v;
          const off = desabilitada(h);
          return (
            <button
              key={v}
              ref={on ? selRef : undefined}
              type="button"
              disabled={off}
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={cn(
                `shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${FOCO}`,
                on ? "bg-primary/15 border-primary text-[hsl(var(--red-text))]" : "bg-secondary border-border text-foreground/85",
                off && "opacity-40",
              )}
            >
              {v}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 1 -> "1 aula", 2 -> "2 aulas" (antes: "aula(s)"). */
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** ["seg", "ter", "sex"] -> "Seg, ter e sex" */
function listaDias(dias: string[]): string {
  const txt = dias.length <= 1 ? dias.join("") : `${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** "Toda segunda", "Todo domingo" — Domingo e Sábado são masculinos. */
const todo = (weekday: number) => (weekday === 0 || weekday === 6 ? "Todo" : "Toda");

function descreveDuracao(start: string, end: string): string {
  const n = horaDe(end) - horaDe(start);
  return n === 1 ? "1 hora" : `${n} horas`;
}

interface EditorState {
  weekday: number;
  dayName: string;
  /** The range being replaced, or null when adding a new one. */
  interval: AvailabilityInterval | null;
  start: string;
  end: string;
}

export default function AdminDisponibilidade() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ weekday: number; name: string; booked: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ slot: AvailabilityInterval; dayName: string; booked: number } | null>(null);

  const key = ["availability", profile?.id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getAvailability(profile!.id),
    enabled: !!profile,
  });

  // Só para explicar (não bloqueia nada): em Recorrência o aluno não escolhe horário, então esta grade
  // não é o que ele usa. Mesma leitura de Configurações (`getAdminSettings`) — a tela continua editável.
  const { data: settings } = useQuery({
    queryKey: ["admin-settings", profile?.id],
    queryFn: () => getAdminSettings(profile!.id),
    enabled: !!profile,
  });
  const emRecorrencia = settings?.modoAgendamento === "recorrencia";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: key });
  }

  const toggleDay = useMutation({
    mutationFn: ({ weekday, active }: { weekday: number; active: boolean }) => toggleAvailabilityDay(profile!.id, weekday, active),
    onSuccess: (_r, vars) => {
      invalidate();
      toast(vars.active ? "Dia aberto para agendamento" : "Dia pausado: não recebe novos agendamentos", {
        className: vars.active ? undefined : "!text-amber",
      });
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível alterar o dia.")),
  });

  const saveSlot = useMutation({
    mutationFn: (e: EditorState) => saveAvailabilityInterval(profile!.id, e.weekday, e.start, e.end, e.interval),
    onSuccess: (result, vars) => {
      if (result.error) {
        setEditorError(result.error);
        return;
      }
      invalidate();
      setEditor(null);
      setEditorError(null);
      toast.success(vars.interval ? "Horário atualizado" : `Horário adicionado em ${vars.dayName}`);
    },
    // Falha de gravação (rede, servidor): antes o sheet ficava aberto sem nenhum aviso e o professor
    // achava que tinha salvado. A mensagem aparece dentro do sheet, junto do botão.
    onError: (err) => {
      setEditorError(mensagemDeErro(err, "Não foi possível salvar. Tente de novo."));
    },
  });

  const deleteSlot = useMutation({
    mutationFn: (slot: AvailabilityInterval) => deleteAvailabilityInterval(slot),
    onSuccess: (_r, slot) => {
      invalidate();
      toast.warning("Horário removido", {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await restoreAvailabilityInterval(slot);
              invalidate();
              toast.success("Horário de volta");
            } catch (err) {
              // Sem isto, um "Desfazer" que falha deixava a lista como estava e o professor sem saber.
              toast.error(mensagemDeErro(err, "Não foi possível desfazer. Adicione o horário de novo."));
            }
          },
        },
      });
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível remover o horário.")),
  });

  if (!profile) return null;

  // Segunda a domingo, como na Agenda (a lista do banco começa no domingo).
  const ordenados = [...(data ?? [])].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
  const diasAbertos = ordenados.filter((d) => d.active && d.slots.length > 0).map((d) => d.name.slice(0, 3).toLowerCase());

  return (
    <div className="page-container">
      <PageHeader title="MINHA DISPONIBILIDADE" subtitle={`Repete toda semana · próximas ${HORIZON_WEEKS} semanas`} back />

      {/* A semana num relance: quais dias estão abertos (antes um cartão dourado com "N intervalos" que repetia a lista). */}
      {!isLoading && !isError && data && (
        <p className="text-[13.5px] text-foreground/85 leading-snug mb-4">
          {diasAbertos.length === 0 ? (
            <>Nenhum dia aberto ainda. Toque em + no dia em que você quer receber alunos.</>
          ) : (
            <>
              <strong className="text-foreground">{listaDias(diasAbertos)}</strong> {diasAbertos.length === 1 ? "aberto" : "abertos"} para agendamento.
            </>
          )}{" "}
          Aulas já marcadas não são afetadas por mudanças aqui.
        </p>
      )}

      {emRecorrencia && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 p-3.5 mb-4 text-[13px] leading-snug">
          <div className="text-amber">
            Você está no modo Recorrência: seus alunos não escolhem horário. Esta grade só vale no modo Autosserviço.
          </div>
          <Link
            to="/admin/configuracoes"
            className="mt-1.5 inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Abrir Configurações
          </Link>
        </div>
      )}

      {isError && <ErrorState title="Não foi possível carregar a disponibilidade" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={3} height={112} />}

      {!isLoading && !isError && data && (
        <div className="flex flex-col gap-3">
          {ordenados.map((day) => day.slots.length === 0 ? (
            // Dia sem horários: uma linha só. Sem interruptor (não há o que ligar) e sem o quadro tracejado repetido.
            <div key={day.weekday} className="card-dark px-[15px] py-2.5 flex items-center gap-3">
              <div className="flex-1">
                <h2 className="text-[15px] font-semibold text-muted-foreground">{day.name}</h2>
                <div className="text-xs text-muted-foreground mt-0.5">Sem horários — alunos não agendam neste dia</div>
              </div>
              <button
                type="button"
                aria-label={`Adicionar horário na ${day.name.toLowerCase()}`}
                onClick={() => {
                  setEditor({ weekday: day.weekday, dayName: day.name, interval: null, start: "06:00", end: "09:00" });
                  setEditorError(null);
                }}
                className={`h-11 w-11 shrink-0 rounded-[10px] border border-muted-foreground/70 bg-secondary flex items-center justify-center active:scale-95 ${FOCO}`}
              >
                <Plus className="h-4 w-4 text-foreground/85" aria-hidden />
              </button>
            </div>
          ) : (
            <div key={day.weekday} className="card-dark p-[15px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <h2 className={cn("text-[15px] font-semibold", day.active ? "text-foreground" : "text-muted-foreground")}>
                    {day.name}
                  </h2>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {day.active
                      ? plural(day.slots.length, "horário", "horários")
                      : `Pausado · ${plural(day.slots.length, "horário guardado", "horários guardados")}`}
                  </div>
                </div>
                <Switch
                  aria-label={`Receber agendamentos na ${day.name.toLowerCase()}`}
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

              {day.slots.length > 0 && (
                <div className="flex flex-col gap-2 mb-2.5">
                  {day.slots.map((slot) => {
                    const booked = slot.bookedCount;
                    return (
                      <div key={slot.key} className="flex items-center gap-2.5 p-2.5 rounded-[13px] bg-raised border border-secondary">
                        <div className="flex-1">
                          <div className={cn("text-[14.5px] font-semibold text-foreground", !day.active && "opacity-60")}>
                            {slot.startTime} – {slot.endTime}
                          </div>
                          <div className={cn("text-xs mt-0.5", day.active && booked > 0 ? "text-amber" : "text-muted-foreground")}>
                            {!day.active
                              ? "Pausado enquanto o dia está desativado"
                              : booked > 0
                                ? `${plural(booked, "aula marcada", "aulas marcadas")} neste horário`
                                : "Aberto para agendamento"}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Editar horário de ${day.name.toLowerCase()}, ${slot.startTime} às ${slot.endTime}`}
                          onClick={() => {
                            setEditor({ weekday: day.weekday, dayName: day.name, interval: slot, start: slot.startTime, end: slot.endTime });
                            setEditorError(null);
                          }}
                          className={`h-11 w-11 rounded-[10px] border border-muted-foreground/70 bg-secondary flex items-center justify-center active:scale-95 ${FOCO}`}
                        >
                          <Pencil className="h-[15px] w-[15px] text-foreground/80" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remover horário de ${day.name.toLowerCase()}, ${slot.startTime} às ${slot.endTime}`}
                          onClick={() =>
                            booked > 0
                              ? setConfirmDelete({ slot, dayName: day.name, booked })
                              : deleteSlot.mutate(slot)
                          }
                          className={`h-11 w-11 rounded-[10px] border border-destructive/70 bg-destructive/10 flex items-center justify-center active:scale-95 ${FOCO}`}
                        >
                          <Trash2 className="h-[15px] w-[15px] text-[hsl(var(--red-text))]" aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                variant="secondary"
                className="w-full h-11 hover:border-primary hover:text-primary"
                onClick={() => {
                  setEditor({ weekday: day.weekday, dayName: day.name, interval: null, start: "06:00", end: "09:00" });
                  setEditorError(null);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Adicionar horário
              </Button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        {editor && (
          <SheetContent>
            <SheetTitle>{editor.interval ? "EDITAR HORÁRIO" : "ADICIONAR HORÁRIO"}</SheetTitle>
            <div className="text-[13px] text-muted-foreground mb-4">
              {todo(editor.weekday)} {editor.dayName.toLowerCase()}, pelas próximas {HORIZON_WEEKS} semanas
            </div>

            <HoraChips
              label="Início"
              horas={faixa(START_MIN, START_MAX, [horaDe(editor.start)])}
              selecionada={editor.start}
              desabilitada={() => false}
              onPick={(v) => {
                // Se o novo início passa do fim, o fim acompanha (início + 1h): nunca deixa um horário inválido.
                const end = horaDe(editor.end) > horaDe(v) ? editor.end : hhmm(Math.min(horaDe(v) + 1, 24));
                setEditor({ ...editor, start: v, end });
                setEditorError(null);
              }}
            />
            <HoraChips
              label="Fim"
              horas={faixa(END_MIN, END_MAX, [horaDe(editor.end)])}
              selecionada={editor.end}
              desabilitada={(h) => h <= horaDe(editor.start)}
              onPick={(v) => {
                setEditor({ ...editor, end: v });
                setEditorError(null);
              }}
            />

            <div className="rounded-xl bg-background border border-border p-3 mb-3.5 text-[13px] text-foreground/85" aria-live="polite">
              {editor.dayName}, <strong className="text-foreground">{editor.start} às {editor.end}</strong> ({descreveDuracao(editor.start, editor.end)})
            </div>

            {editorError && (
              <div role="alert" className="rounded-[13px] border border-destructive/35 bg-destructive/10 p-3 mb-3.5 text-[13px] text-destructive">
                {editorError}
              </div>
            )}

            <div className="flex gap-2.5">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => setEditor(null)}>
                Voltar
              </Button>
              <Button size="lg" className="flex-[1.4]" onClick={() => saveSlot.mutate(editor)} disabled={saveSlot.isPending}>
                {editor.interval ? "Salvar alterações" : "Adicionar horário"}
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDeactivate}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title={`DESATIVAR ${confirmDeactivate?.name.toUpperCase() ?? ""}`}
        description={
          confirmDeactivate
            ? `${confirmDeactivate.booked === 1 ? "Há 1 aula já marcada nesse dia. Ela continua valendo" : `Há ${confirmDeactivate.booked} aulas já marcadas nesse dia. Elas continuam valendo`}, mas o dia deixa de aceitar novos agendamentos. Os horários ficam guardados, e você pode reativar o dia quando quiser.`
            : ""
        }
        confirmLabel="Desativar"
        onConfirm={() => confirmDeactivate && toggleDay.mutate({ weekday: confirmDeactivate.weekday, active: false })}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="REMOVER HORÁRIO"
        description={
          confirmDelete
            ? `${confirmDelete.booked === 1 ? "Há 1 aula marcada nesse horário" : `Há ${confirmDelete.booked} aulas marcadas nesse horário`} em ${confirmDelete.dayName.toLowerCase()}. Remover o horário não cancela ${confirmDelete.booked === 1 ? "essa aula" : "essas aulas"}, mas bloqueia novos agendamentos.`
            : ""
        }
        confirmLabel="Remover"
        onConfirm={() => confirmDelete && deleteSlot.mutate(confirmDelete.slot)}
      />
    </div>
  );
}
