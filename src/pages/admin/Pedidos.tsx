import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPriceLabel } from "@/lib/packageUtils";
import { relativeTime } from "@/lib/dateUtils";
import { useSaidaSuave } from "@/hooks/useSaidaSuave";
import {
  approvePurchaseRequest,
  getPedidosDecididos,
  getPurchaseRequests,
  rejectPurchaseRequest,
  restorePurchaseRequest,
} from "@/integrations/backend/api";
import { mensagemDeErro } from "@/lib/erros";

export default function AdminPedidos() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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

  // Pedido decidido sai esmaecendo em vez de sumir de uma vez. Hook antes de qualquer retorno antecipado.
  const pedidosV = useSaidaSuave(data ?? [], (p) => p.request.id);
  const { data: decididos } = useQuery({
    queryKey: ["purchase-requests-decididos", profile?.id],
    queryFn: () => getPedidosDecididos(profile!.id),
    enabled: !!profile,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["purchase-requests-decididos"] });
    // O painel conta estes pedidos ("N pedidos de aulas") — sem isto a contagem ficava velha.
    queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const approve = useMutation({
    mutationFn: ({ id }: { id: string; student: string }) => approvePurchaseRequest(id),
    onSuccess: (_r, { student }) => {
      invalidar();
      toast.success(`Pedido de ${student.split(" ")[0]} aprovado · aulas liberadas`);
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível aprovar o pedido.")),
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
              .catch((err) => toast.error(mensagemDeErro(err, "Não foi possível desfazer."))),
        },
      });
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível recusar o pedido.")),
  });

  // Só o cartão que está sendo decidido trava (antes `approve.isPending` travava TODOS os "Aprovar",
  // sem explicação, e "Recusar" ficava livre durante uma aprovação).
  const emAndamento = (id: string) =>
    (approve.isPending && approve.variables?.id === id) || (reject.isPending && reject.variables?.id === id);

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">PEDIDOS</h1>
      <div className="text-[13px] text-muted-foreground mb-4">Pacotes e aulas avulsas que seus alunos pediram</div>

      {isError && <ErrorState title="Não foi possível carregar os pedidos" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={2} height={118} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col">
          {/* Pedido decidido não some de uma vez: esmaece e fecha o espaço (ver `useSaidaSuave`). O espaço entre cartões é
              padding do próprio item (`pb-2.5`), não `gap`, para fechar junto com ele. */}
          {pedidosV.map(({ item: { request, studentName, template, classesLostOnApprove, recorrenciaRestantes, aulasRestantes }, saindo }) => (
            <div
              key={request.id}
              {...({ inert: saindo ? "" : undefined } as Record<string, string | undefined>)}
              aria-hidden={saindo || undefined}
              className={saindo ? "grid animate-bb-sai" : "grid"}
            >
            <div className={saindo ? "min-h-0 overflow-hidden" : "min-h-0"}>
            <div className="pb-2.5">
            <div className="card-dark p-[15px]">
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
                {/* Neutro: é um rótulo de tipo, não um estado — o vermelho (e o dourado) têm significado no app. */}
                <Badge className="bg-secondary text-foreground whitespace-nowrap">
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
                  variant="soft"
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
                  disabled={emAndamento(request.id)}
                  aria-label={`Aprovar o pedido de ${studentName}`}
                >
                  {approve.isPending && approve.variables?.id === request.id ? "Aprovando…" : "Aprovar"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => reject.mutate({ id: request.id, student: studentName })}
                  disabled={emAndamento(request.id)}
                  aria-label={`Recusar o pedido de ${studentName}`}
                >
                  {reject.isPending && reject.variables?.id === request.id ? "Recusando…" : "Recusar"}
                </Button>
              </div>
            </div>
            </div>
            </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Nenhum pedido pendente"
          description="Tudo em dia por aqui."
          ctaLabel="Ver agenda"
          ctaVariant="secondary"
          onCta={() => navigate("/admin/agenda")}
        />
      )}

      {decididos && decididos.length > 0 && (
        <section aria-labelledby="decididos" className="mt-8">
          <h2 id="decididos" className="section-title mb-2">
            Decididos recentemente
          </h2>
          <ul className="card-dark divide-y divide-border">
            {decididos.map(({ request, studentName, template }) => (
              <li key={request.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-foreground truncate">{studentName}</div>
                  <div className="text-[13px] text-muted-foreground truncate">
                    {template?.name ?? (request.kind === "package" ? "Pacote" : "Aula avulsa")}
                    {request.decidedAt ? ` · ${relativeTime(request.decidedAt)}` : ""}
                  </div>
                </div>
                <Badge className={request.status === "approved" ? "border border-border text-muted-foreground" : "bg-destructive/20 text-[hsl(var(--red-text))]"}>
                  {request.status === "approved" ? "Aprovado" : "Recusado"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
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
