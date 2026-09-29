import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, ChevronRight, Mail, Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard, SkeletonList } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ActivePackageCard } from "@/components/ActivePackageCard";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatQuando } from "@/lib/dateUtils";
import { isAwaitingConfirmation } from "@/lib/bookingStatus";
import type { Booking } from "@/integrations/backend/types";
import { formatPriceLabel } from "@/lib/packageUtils";
import { cn } from "@/lib/utils";
import {
  assignPackageFromTemplate,
  getAdminStudentDetail,
  getEmailDoAluno,
  getPackageTemplates,
  getSaldoPacote,
  removeActivePackage,
} from "@/integrations/backend/api";
import { StatusBadge } from "@/components/StatusBadge";

/** Uma aula do aluno: toca e abre o detalhe da aula (antes a lista era só texto). */
function LinhaAula({ booking, onOpen }: { booking: Booking; onOpen: () => void }) {
  const agora = Date.now();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full min-h-[52px] card-dark px-3.5 py-2.5 flex items-center gap-2.5 text-left active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex-1 min-w-0 text-[13.5px] text-foreground/90">{formatQuando(booking.startTime)}</div>
      <StatusBadge
        status={booking.status}
        semRegistro={isAwaitingConfirmation(booking.status, booking.endTime)}
        agora={booking.status === "scheduled" && new Date(booking.startTime).getTime() <= agora && new Date(booking.endTime).getTime() > agora}
      />
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
    </button>
  );
}

export default function AdminAlunoDetalhe() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  // Tocar num modelo só ESCOLHE; quem atribui é o botão de baixo (antes um toque já criava o pacote novo e
  // encerrava o atual, sem aviso).
  const [modeloEscolhido, setModeloEscolhido] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-student-detail", studentId],
    queryFn: () => getAdminStudentDetail(studentId!),
    enabled: !!studentId,
  });

  const { data: templates } = useQuery({
    queryKey: ["package-templates-admin", profile?.id],
    queryFn: () => getPackageTemplates(profile!.id),
    enabled: assignOpen && !!profile,
  });

  // Contato do aluno (0036). Se a consulta falhar (função ainda não aplicada, rede), a linha simplesmente não
  // aparece: o e-mail é um extra, não pode derrubar a tela.
  const { data: emailAluno } = useQuery({
    queryKey: ["student-email", studentId],
    queryFn: () => getEmailDoAluno(studentId!),
    enabled: !!studentId,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const pkg = data?.package ?? null;
  const isRecorrenciaPkg = !!pkg && pkg.origin === "recurrence" && pkg.status === "active";
  const { data: saldo } = useQuery({
    queryKey: ["saldo-pacote", pkg?.id],
    queryFn: () => getSaldoPacote(pkg!.id),
    enabled: isRecorrenciaPkg,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin-student-detail", studentId] });
    queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }

  const assign = useMutation({
    mutationFn: (templateId: string) => assignPackageFromTemplate(studentId!, templateId),
    onSuccess: (_r, templateId) => {
      invalidate();
      setAssignOpen(false);
      setModeloEscolhido(null);
      const t = templates?.find((x) => x.id === templateId);
      toast.success(`Pacote atribuído a ${data?.student.name.split(" ")[0]}${t ? ` · ${t.name}` : ""}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível atribuir o pacote."),
  });

  const remove = useMutation({
    mutationFn: () => removeActivePackage(studentId!),
    onSuccess: () => {
      invalidate();
      toast.warning("Pacote removido");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível remover o pacote."),
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title="ALUNO" back />
        <SkeletonCard height={200} className="mb-4" />
        <SkeletonList count={3} height={54} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-container">
        <PageHeader title="ALUNO" back />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const { student, credits, proximas, anteriores, completedCount, noShowCount } = data;
  const escolhido = templates?.find((t) => t.id === modeloEscolhido) ?? null;
  const primeiroNome = student.name.split(" ")[0];
  // O pacote experimental (trial) convive com os outros e NAO e encerrado ao atribuir; os demais sao.
  const restantes = saldo ? saldo.restantes : pkg ? Math.max(0, pkg.totalClasses - pkg.usedClasses) : 0;
  const avisoSubstitui =
    pkg && pkg.origin !== "trial"
      ? `${primeiroNome} já tem um pacote ativo (${restantes === 1 ? "1 aula restante" : `${restantes} aulas restantes`}). Atribuir um novo encerra o atual. As aulas já marcadas continuam valendo.`
      : null;
  // Frequência sobre as aulas que CONTAM (realizadas + faltas), não sobre `history` — aquilo é a
  // janela de exibição das 6 últimas linhas, que com recorrência é composta só de aulas futuras
  // ainda `scheduled` e zerava a frequência de todo aluno em recorrência.
  const faltas = noShowCount;
  const consideradas = completedCount + noShowCount;
  const freq = consideradas > 0 ? Math.round((completedCount / consideradas) * 100) : 0;

  return (
    <div className="page-container">
      <PageHeader title={student.name.toUpperCase()} subtitle="Aluno" back />

      {emailAluno && (
        <a
          href={`mailto:${emailAluno}`}
          className="-mt-2 mb-3 inline-flex min-h-11 max-w-full items-center gap-2 text-[13.5px] text-muted-foreground underline underline-offset-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          <span className="break-all">{emailAluno}</span>
        </a>
      )}

      {/* A pergunta de quem abre um aluno antes do treino: quando é a próxima aula? */}
      <div className="mb-3.5 text-[13.5px]">
        {proximas[0] ? (
          <button
            type="button"
            onClick={() => navigate(`/admin/aula/${proximas[0].id}`)}
            className="text-left text-foreground/90 underline underline-offset-4 min-h-11 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Próxima aula: <strong className="text-foreground">{formatQuando(proximas[0].startTime)}</strong>
          </button>
        ) : (
          <span className="text-muted-foreground">Sem aula marcada</span>
        )}
      </div>

      <div className="mb-3.5">
        <ActivePackageCard pkg={pkg} credits={credits} saldo={saldo} />
      </div>

      <div className="flex gap-2.5 mb-4">
        <div className="flex-1 card-dark p-3.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Frequência</div>
          <div className="font-display text-[28px] text-foreground leading-tight">{freq}%</div>
        </div>
        <div className="flex-1 card-dark p-3.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faltas</div>
          <div className="font-display text-[28px] text-destructive leading-tight">{faltas}</div>
        </div>
      </div>

      <div className="flex gap-2.5 mb-5">
        <Button className="flex-1" onClick={() => setAssignOpen(true)}>
          Atribuir pacote
        </Button>
        <Button variant="secondary" className="flex-1" disabled={!pkg} onClick={() => setConfirmRemove(true)}>
          Remover pacote
        </Button>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/admin/alunos/${studentId}/perfil-lutador`)}
        className="w-full card-dark p-3.5 mb-2.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="h-9 w-9 shrink-0 rounded-full bg-amber/15 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-amber" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-foreground">Perfil de Boxe</div>
          <div className="text-[12px] text-muted-foreground">Sua avaliação técnica e a comparação com a autoavaliação do aluno</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => navigate(`/admin/alunos/${studentId}/recorrencia`)}
        className="w-full card-dark p-3.5 mb-5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="h-9 w-9 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
          <CalendarClock className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-foreground">Horários fixos</div>
          <div className="text-[12px] text-muted-foreground">Rotina semanal e geração de aulas</div>
        </div>
      </button>

      {proximas.length === 0 && anteriores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
          <div className="text-[14px] font-semibold text-foreground mb-1">Ainda sem aulas</div>
          <div className="text-[12.5px] text-muted-foreground">
            {pkg ? `As aulas de ${primeiroNome} aparecem aqui.` : `Atribua um pacote para ${primeiroNome} começar.`}
          </div>
        </div>
      ) : (
        <>
          {proximas.length > 0 && (
            <section aria-labelledby="aulas-proximas" className="mb-5">
              <h2 id="aulas-proximas" className="section-title mb-3">Próximas aulas</h2>
              <div className="flex flex-col gap-2.5">
                {proximas.map((b) => (
                  <LinhaAula key={b.id} booking={b} onOpen={() => navigate(`/admin/aula/${b.id}`)} />
                ))}
              </div>
            </section>
          )}
          {anteriores.length > 0 && (
            <section aria-labelledby="aulas-anteriores" className="mb-4">
              <h2 id="aulas-anteriores" className="section-title mb-3">Aulas anteriores</h2>
              <div className="flex flex-col gap-2.5">
                {anteriores.map((b) => (
                  <LinhaAula key={b.id} booking={b} onOpen={() => navigate(`/admin/aula/${b.id}`)} />
                ))}
              </div>
            </section>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate(`/admin/historico?busca=${encodeURIComponent(student.name)}`)}
          >
            Ver todas as aulas de {primeiroNome}
          </Button>
        </>
      )}

      <Sheet
        open={assignOpen}
        onOpenChange={(o) => {
          setAssignOpen(o);
          if (!o) setModeloEscolhido(null);
        }}
      >
        <SheetContent>
          <div className="flex items-start gap-2.5 mb-4">
            <div className="flex-1">
              <SheetTitle>ATRIBUIR PACOTE</SheetTitle>
              <div className="text-[13px] text-muted-foreground mt-0.5">Escolha um modelo para {student.name}</div>
            </div>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="h-11 w-11 shrink-0 rounded-[11px] border border-[#333] bg-secondary flex items-center justify-center active:scale-95 transition-transform"
              >
                <X className="h-[15px] w-[15px] text-foreground/80" />
              </button>
            </SheetClose>
          </div>
          {/* Atribuir ENCERRA o pacote ativo não-experimental (regra do banco); as aulas já marcadas continuam valendo. */}
          {avisoSubstitui && (
            <div className="rounded-xl border border-amber/40 bg-amber/10 p-3.5 mb-4 text-[13px] leading-snug text-amber">
              {avisoSubstitui}
            </div>
          )}
          <div role="radiogroup" aria-label="Modelo de pacote" className="flex flex-col gap-2.5">
            {templates?.map((t) => {
              const on = modeloEscolhido === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setModeloEscolhido(t.id)}
                  disabled={assign.isPending}
                  className={cn(
                    "w-full text-left card-dark p-4 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on && "border-primary bg-primary/10",
                  )}
                >
                  <div>
                    <div className="text-[15px] font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  </div>
                  <div className="text-accent font-semibold text-sm shrink-0">{formatPriceLabel(t.priceCents)}</div>
                </button>
              );
            })}
          </div>
          <Button
            size="lg"
            className="w-full mt-4"
            disabled={!escolhido || assign.isPending}
            onClick={() => escolhido && assign.mutate(escolhido.id)}
          >
            {assign.isPending ? "Atribuindo…" : escolhido ? `Atribuir ${escolhido.name}` : "Escolha um modelo"}
          </Button>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="REMOVER PACOTE"
        description={`O pacote ativo de ${student.name} será encerrado. Créditos restantes serão perdidos.`}
        confirmLabel="Remover"
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
