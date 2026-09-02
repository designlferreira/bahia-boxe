import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard, SkeletonList } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig } from "@/lib/bookingStatus";
import { formatDateTime } from "@/lib/dateUtils";
import { formatPriceLabel, packageProgressPct } from "@/lib/packageUtils";
import {
  assignPackageFromTemplate,
  getAdminStudentDetail,
  getPackageTemplates,
  removeActivePackage,
} from "@/integrations/backend/api";

export default function AdminAlunoDetalhe() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
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

  const { student, package: pkg, credits, history } = data;
  const faltas = history.filter((h) => h.status === "no_show").length;
  const completed = history.filter((h) => h.status === "completed").length;
  const freq = history.length > 0 ? Math.round((completed / history.length) * 100) : 0;

  return (
    <div className="page-container">
      <PageHeader title={student.name.toUpperCase()} subtitle="Aluno" back />

      <div className="rounded-[20px] p-[18px] bg-[linear-gradient(150deg,#1F1B0C,#171717_60%)] border border-[#35301A] mb-3.5">
        <div className="text-[11.5px] uppercase tracking-wide text-accent/70 font-semibold">Pacote ativo</div>
        <div className="flex items-end gap-2 my-1 mb-3">
          <span className="font-display text-[56px] leading-[0.85] text-accent">{credits}</span>
          <span className="text-[13px] text-muted-foreground pb-2">créditos disponíveis</span>
        </div>
        {pkg ? (
          <>
            <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
                style={{ width: `${packageProgressPct(pkg.totalClasses, pkg.usedClasses)}%` }}
              />
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              {pkg.usedClasses} de {pkg.totalClasses} usadas
            </div>
          </>
        ) : (
          <div className="text-[12.5px] text-muted-foreground">Sem pacote ativo</div>
        )}
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
        className="w-full card-dark p-3.5 mb-5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="h-9 w-9 shrink-0 rounded-full bg-amber/15 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-amber" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-foreground">Perfil de Boxe</div>
          <div className="text-[12px] text-muted-foreground">Sua avaliação técnica e a comparação com a autoavaliação do aluno</div>
        </div>
      </button>

      <div className="font-display text-lg tracking-wide text-foreground mb-2.5">ÚLTIMAS AULAS</div>
      <div className="flex flex-col gap-2.5">
        {history.length === 0 && <div className="text-[13px] text-muted-foreground">Nenhuma aula registrada.</div>}
        {history.map((h) => {
          const cfg = getStatusConfig(h.status);
          return (
            <div key={h.id} className="card-dark p-3 flex items-center gap-2.5">
              <div className="flex-1 text-[13.5px] text-foreground/85">{formatDateTime(h.startTime)}</div>
              <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
            </div>
          );
        })}
      </div>

      <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
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
          <div className="flex flex-col gap-2.5">
            {templates?.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => assign.mutate(t.id)}
                disabled={assign.isPending}
                className="w-full text-left card-dark p-4 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
              >
                <div>
                  <div className="text-[15px] font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                </div>
                <div className="text-accent font-semibold text-sm shrink-0">{formatPriceLabel(t.priceCents)}</div>
              </button>
            ))}
          </div>
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
