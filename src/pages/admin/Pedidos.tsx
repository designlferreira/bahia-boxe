import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonList } from "@/components/SkeletonCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPriceLabel } from "@/lib/packageUtils";
import {
  approvePurchaseRequest,
  getPurchaseRequests,
  rejectPurchaseRequest,
  restorePurchaseRequest,
} from "@/integrations/backend/api";

export default function AdminPedidos() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<{ id: string; student: string } | null>(null);

  const key = ["purchase-requests", profile?.id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: () => getPurchaseRequests(profile!.id),
    enabled: !!profile,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approvePurchaseRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success("Pedido aprovado · pacote criado");
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectPurchaseRequest(id),
    onSuccess: (_r, id) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.warning("Pedido recusado", {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            await restorePurchaseRequest(id);
            queryClient.invalidateQueries({ queryKey: key });
          },
        },
      });
    },
  });

  return (
    <div className="page-container">
      <h1 className="font-display text-3xl tracking-wide text-foreground leading-none mb-1">PEDIDOS</h1>
      <div className="text-[12.5px] text-muted-foreground mb-4">Solicitações de pacote e aula avulsa</div>

      {isError && <ErrorState title="Não foi possível carregar os pedidos" onRetry={() => refetch()} />}
      {isLoading && !isError && <SkeletonList count={2} height={118} />}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.map(({ request, studentName, template }) => (
            <div key={request.id} className="card-dark p-[15px]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-foreground">{studentName}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">
                    {template?.name}
                    {template ? ` · ${formatPriceLabel(template.priceCents)}` : ""}
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
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => approve.mutate(request.id)} disabled={approve.isPending}>
                  Aprovar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setRejectTarget({ id: request.id, student: studentName })}
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
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="RECUSAR PEDIDO"
        description={`O pedido de ${rejectTarget?.student} será recusado. O aluno recebe um aviso no app.`}
        confirmLabel="Recusar"
        onConfirm={() => rejectTarget && reject.mutate(rejectTarget.id)}
      />
    </div>
  );
}
