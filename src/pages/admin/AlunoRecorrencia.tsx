import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard, SkeletonList } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createAlunoRecorrencia,
  gerarPacoteRecorrencia,
  getAdminStudentDetail,
  getAlunoRecorrencias,
  getSaldoPacote,
  setAlunoRecorrenciaAtivo,
} from "@/integrations/backend/api";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/**
 * Grade travada na mesma granularidade do AUTOSSERVICO (hora cheia, 60 min fixos) — CAMADA 1
 * contra overbooking (CLAUDE.md). A view `available_slots` que a tela "Agendar" usa pra decidir o
 * que oferecer exclui por IGUALDADE exata de `start_time`/`end_time`, não por sobreposição de
 * intervalo; um horário fora da hora cheia ou com duração diferente de 60 min escaparia dessa
 * checagem mesmo sobrepondo fisicamente um horário publicado. Deliberado: reduz a flexibilidade
 * que a recorrência prometia (nada de 30/45/90 min por enquanto) em troca de nunca depender de um
 * aviso pós-fato. Se precisar de outra duração no futuro, resolve a view antes, não aqui.
 */
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hhmm = (h: number) => String(h).padStart(2, "0") + ":00";
const DURACAO_MINUTOS = 60;

export default function AdminAlunoRecorrencia() {
  const { studentId } = useParams<{ studentId: string }>();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [diaSemana, setDiaSemana] = useState(1);
  const [horario, setHorario] = useState("18:00");
  const [totalAulas, setTotalAulas] = useState(8);

  const detailQuery = useQuery({
    queryKey: ["admin-student-detail", studentId],
    queryFn: () => getAdminStudentDetail(studentId!),
    enabled: !!studentId,
  });

  const recorrenciasQuery = useQuery({
    queryKey: ["aluno-recorrencias", studentId],
    queryFn: () => getAlunoRecorrencias(studentId!),
    enabled: !!studentId,
  });

  const pkg = detailQuery.data?.package ?? null;
  const isRecorrenciaPkg = !!pkg && pkg.origin === "recurrence" && pkg.status === "active";

  const saldoQuery = useQuery({
    queryKey: ["saldo-pacote", pkg?.id],
    queryFn: () => getSaldoPacote(pkg!.id),
    enabled: isRecorrenciaPkg,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["aluno-recorrencias", studentId] });
    queryClient.invalidateQueries({ queryKey: ["admin-student-detail", studentId] });
    queryClient.invalidateQueries({ queryKey: ["saldo-pacote"] });
    queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }

  const addRecorrencia = useMutation({
    mutationFn: () => createAlunoRecorrencia(studentId!, diaSemana, horario, DURACAO_MINUTOS),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      toast.success(`Recorrência adicionada · toda ${WEEKDAY_LABELS[diaSemana].toLowerCase()} às ${horario}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível adicionar a recorrência."),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => setAlunoRecorrenciaAtivo(id, ativo),
    onSuccess: (_r, vars) => {
      invalidate();
      toast(vars.ativo ? "Recorrência reativada" : "Recorrência desativada", {
        className: vars.ativo ? undefined : "!text-amber",
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível alterar a recorrência."),
  });

  const gerarPacote = useMutation({
    mutationFn: () => gerarPacoteRecorrencia(studentId!, totalAulas),
    onSuccess: () => {
      invalidate();
      toast.success(`Pacote de ${totalAulas} aulas gerado`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível gerar o pacote."),
  });

  if (detailQuery.isLoading || recorrenciasQuery.isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="RECORRÊNCIA" back />
        <SkeletonCard height={140} className="mb-4" />
        <SkeletonList count={2} height={72} />
      </div>
    );
  }

  if (detailQuery.isError || recorrenciasQuery.isError || !detailQuery.data) {
    return (
      <div className="page-container">
        <PageHeader title="RECORRÊNCIA" back />
        <ErrorState onRetry={() => (detailQuery.refetch(), recorrenciasQuery.refetch())} />
      </div>
    );
  }

  const { student } = detailQuery.data;
  const recorrencias = recorrenciasQuery.data ?? [];
  const activasCount = recorrencias.filter((r) => r.ativo).length;
  const saldo = saldoQuery.data ?? null;

  return (
    <div className="page-container">
      <PageHeader title="RECORRÊNCIA" subtitle={student.name} back />

      {isRecorrenciaPkg && saldo && (
        <div className="rounded-[20px] p-[18px] bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-[#35301A] mb-4">
          <div className="text-[11.5px] uppercase tracking-wide text-accent/70 font-semibold mb-2">
            Pacote de recorrência ativo
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="font-display text-[56px] leading-[0.85] text-accent">{saldo.restantes}</span>
            <span className="text-[13px] text-muted-foreground pb-2">de {saldo.total} restantes</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
              style={{ width: `${saldo.total > 0 ? (saldo.consumidas / saldo.total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {saldo.consumidas} usadas
            {saldo.aRepor > 0 && <span className="text-amber"> · {saldo.aRepor} aguardando reposição</span>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2.5">
        <div className="font-display text-lg tracking-wide text-foreground">DIAS FIXOS</div>
        <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 mb-5">
        {recorrencias.length === 0 && (
          <div className="border border-dashed border-[#2E2E2E] rounded-[13px] p-4 text-center">
            <div className="text-[12.5px] text-muted-foreground">
              Nenhum dia fixo cadastrado para {student.name.split(" ")[0]} ainda.
            </div>
          </div>
        )}
        {recorrencias.map((r) => (
          <div key={r.id} className={cn("card-dark p-3.5 flex items-center gap-3", !r.ativo && "opacity-50")}>
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold text-foreground">{WEEKDAY_LABELS[r.diaSemana]}</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                {r.horario} · {r.duracaoMinutos} min
              </div>
            </div>
            <Switch
              aria-label="Alternar recorrência"
              checked={r.ativo}
              onCheckedChange={(checked) => toggleAtivo.mutate({ id: r.id, ativo: checked })}
            />
          </div>
        ))}
      </div>

      <div className="card-dark p-4">
        <div className="font-display text-base tracking-wide text-foreground mb-1">GERAR PACOTE</div>
        <div className="text-[12.5px] text-muted-foreground mb-3">
          Materializa aulas concretas na agenda a partir dos dias fixos ativos
          {activasCount > 0 ? ` (${activasCount} ativo${activasCount > 1 ? "s" : ""})` : ""}.
        </div>
        <div className="flex gap-2.5">
          <Input
            type="number"
            min={1}
            value={totalAulas}
            onChange={(e) => setTotalAulas(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-24 text-center"
            aria-label="Número de aulas"
          />
          <Button
            className="flex-1"
            disabled={activasCount === 0 || gerarPacote.isPending}
            onClick={() => gerarPacote.mutate()}
          >
            Gerar {totalAulas} aula{totalAulas > 1 ? "s" : ""}
          </Button>
        </div>
        {activasCount === 0 && (
          <div className="text-[12px] text-amber mt-2">Ative pelo menos um dia fixo para gerar um pacote.</div>
        )}
      </div>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetTitle>ADICIONAR DIA FIXO</SheetTitle>
          <div className="text-[13px] text-muted-foreground mb-4">Novo dia/horário recorrente para {student.name}</div>

          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Dia da semana</div>
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-3.5 pb-1 scroll-fade-x">
            {WEEKDAY_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => setDiaSemana(idx)}
                className={cn(
                  "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                  diaSemana === idx ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                )}
              >
                {label.slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Horário</div>
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 mb-1 pb-1 scroll-fade-x">
            {HOURS.map((h) => {
              const v = hhmm(h);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setHorario(v)}
                  className={cn(
                    "shrink-0 h-11 px-4 rounded-xl border text-sm font-semibold transition-all active:scale-95",
                    horario === v ? "bg-primary/15 border-primary text-primary" : "bg-secondary border-[#333] text-foreground/85",
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] text-muted-foreground mb-4">
            Hora cheia, {DURACAO_MINUTOS} min — mesma grade da disponibilidade do autosserviço.
          </div>

          <div className="flex gap-2.5">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setAddOpen(false)}>
              Voltar
            </Button>
            <Button size="lg" className="flex-[1.4]" onClick={() => addRecorrencia.mutate()} disabled={addRecorrencia.isPending}>
              Adicionar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
