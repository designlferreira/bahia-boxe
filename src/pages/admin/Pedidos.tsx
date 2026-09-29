import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Inbox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPriceLabel } from "@/lib/packageUtils";
import { relativeTime } from "@/lib/dateUtils";
import {
  approvePurchaseRequest,
  getPurchaseRequests,
  rejectPurchaseRequest,
  restorePurchaseRequest,
} from "@/integrations/backend/api";

export default function AdminPedidos() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  // Aprovar SEMPRE confirma (é dinheiro e cria um pacote, sem desfazer); recusar não confirma — tem
  // "Desfazer" (decisão do Lucas, 2026-09-29).
  const [approveTarget, setApproveTarget] = useState<{ id: string; student: string; lost: number; what: string } | null>(null);

  const key = ["purchase-requests", profile?.id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getPurchaseRequests(profile!.id),
    enabled: !!profile,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: key });
    // O painel conta estes pedidos ("N pedidos de aulas") — sem isto a contagem ficava velha.
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const approve = useMutation({
    mutationFn: ({ id }: { id: string; student: string }) => approvePurchaseRequest(id),
    onSuccess: (_r, { student }) => {
      invalidar();
      toast.success(`Pedido de ${student.split(" ")[0]} aprovado · aulas liberadas`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível aprovar o pedido."),
  });

  const reject = useMutation({
    mutationFn: ({ id }: { id: string; student: string }) => rejectPurchaseRequest(id),
    onSuccess: (_r, { id, student }) => {
      invalidar();
      toast.warning(`Pedido de ${student.split(" ")[0]} recusado · o aluno é avisado no app`, {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: () =>
            restorePurchaseRequest(id)
              .then(invalidar)
              .catch((err) => toast.error(err instanceof Error ? err.message : "Não foi possível desfazer.")),
        },
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível recusar o pedido."),
  });

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">PEDIDOS</h1>
      <div className="text-[12.5px] text-muted-foreground mb-4">Solicitações de pacote e aula avulsa</div>

      {isError && <ErrorState title="Não foi possível carregar os pedidos" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={2} height={118} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map(({ request, studentName, template, classesLostOnApprove, recorrenciaRestantes, aulasRestantes }) => (
            <div key={request.id} className="card-dark p-[15px]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-foreground">{studentName}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">
                    {template?.name}
                    {template ? ` · ${formatPriceLabel(template.priceCents)}` : ""}
                  </div>
                  {/* Contexto pra decidir sem abrir o perfil: há quanto tempo espera e o que o aluno tem hoje. */}
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">
                    Pedido {relativeTime(request.createdAt)} ·{" "}
                    {aulasRestantes === null
                      ? "sem pacote ativo"
                      : aulasRestantes === 1
                        ? "1 aula restante"
                        : `${aulasRestantes} aulas restantes`}
                  </div>
                </div>
                <Badge
                  className={
                    request.kind === "package" ? "bg-accent/15 text-accent whitespace-nowrap" : "bg-primary/15 text-primary whitespace-nowrap"
                  }
                >
                  {request.kind === "package" ? "Pacote" : "Aula avulsa"}
                </Badge>
              </div>
              {request.notes && (
                <p className="rounded-xl bg-secondary px-3 py-2.5 text-sm text-foreground mb-3">
                  <span className="sr-only">Recado do aluno: </span>“{request.notes}”
                </p>
              )}
              {classesLostOnApprove > 0 && (
                // Aprovar encerra o pacote ativo do aluno (regra do banco — ver getPurchaseRequests).
                // Sem este aviso, o professor aprovava sem saber que o aluno perdia o que sobrava.
                <p className="flex gap-2 items-start text-sm text-amber mb-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    {studentName.split(" ")[0]} ainda tem {classesLostOnApprove}{" "}
                    {classesLostOnApprove === 1 ? "aula" : "aulas"} no pacote atual. Aprovar agora encerra esse
                    pacote.
                  </span>
                </p>
              )}
              {classesLostOnApprove === 0 && recorrenciaRestantes > 0 && (
                // Recorrência: as aulas já estão marcadas e continuam valendo — informação, não alarme.
                <p className="text-sm text-muted-foreground mb-3">
                  {studentName.split(" ")[0]} tem {recorrenciaRestantes} {recorrenciaRestantes === 1 ? "aula marcada" : "aulas marcadas"}{" "}
                  na recorrência. {recorrenciaRestantes === 1 ? "Ela continua" : "Elas continuam"} valendo.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setApproveTarget({
                      id: request.id,
                      student: studentName,
                      lost: classesLostOnApprove,
                      what: template?.name ?? (request.kind === "package" ? "Pacote" : "Aula avulsa"),
                    })
                  }
                  disabled={approve.isPending}
                >
                  Aprovar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => reject.mutate({ id: request.id, student: studentName })}
                >
                  Recusar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState icon={Inbox} title="Nenhum pedido pendente" description="Tudo em dia por aqui." />
      )}

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
        title={approveTarget && approveTarget.lost > 0 ? "APROVAR E ENCERRAR O PACOTE ATUAL?" : "APROVAR PEDIDO?"}
        description={
          approveTarget
            ? approveTarget.lost > 0
              ? `${approveTarget.student} ainda tem ${approveTarget.lost} ${approveTarget.lost === 1 ? "aula" : "aulas"} para usar no pacote atual. Aprovar agora encerra esse pacote e ${approveTarget.lost === 1 ? "essa aula deixa" : "essas aulas deixam"} de valer. As aulas já agendadas continuam de pé. Se preferir, aprove quando o pacote atual acabar.`
              : `${approveTarget.what} para ${approveTarget.student}. O aluno recebe as aulas na hora e é avisado no app. Não dá para desfazer depois.`
            : ""
        }
        confirmLabel={approveTarget && approveTarget.lost > 0 ? "Aprovar mesmo assim" : "Aprovar"}
        cancelLabel="Voltar"
        tone={approveTarget && approveTarget.lost > 0 ? "destructive" : "default"}
        onConfirm={() => approveTarget && approve.mutate({ id: approveTarget.id, student: approveTarget.student })}
      />
    </div>
  );
}
