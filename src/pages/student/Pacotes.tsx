import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/SkeletonCard";
import { formatPriceLabel, packageProgressPct } from "@/lib/packageUtils";
import { formatDateShort } from "@/lib/dateUtils";
import { getPackageTemplates, getStudentAdminId, getStudentHome, requestPackage, requestSingleClass } from "@/integrations/backend/api";
import type { PackageTemplate } from "@/integrations/backend/types";

export default function StudentPacotes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: home } = useQuery({
    queryKey: ["student-home", profile?.id],
    queryFn: () => getStudentHome(profile!.id),
    enabled: !!profile,
  });

  const { data: adminId } = useQuery({
    queryKey: ["student-admin-id", profile?.id],
    queryFn: () => getStudentAdminId(profile!.id),
    enabled: !!profile,
    staleTime: Infinity,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["package-templates", adminId],
    queryFn: () => getPackageTemplates(adminId!),
    enabled: !!adminId,
  });

  const request = useMutation({
    mutationFn: (t: PackageTemplate) =>
      t.totalClasses > 1 ? requestPackage(t.id) : requestSingleClass(`Pedido a partir de "${t.name}"`),
    onSuccess: (_r, t) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast.success(`Pedido de ${t.name.toLowerCase()} enviado`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível enviar o pedido."),
  });

  return (
    <div className="page-container">
      <PageHeader title="MEUS PACOTES" back />

      {home?.package && (
        <div className="card-dark p-[18px] mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[15px] font-semibold text-foreground">{home.package.templateName}</span>
            <Badge className="bg-accent/15 text-accent">Ativo</Badge>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-gold origin-left animate-bb-bar"
              style={{ width: `${packageProgressPct(home.package.totalClasses, home.package.usedClasses)}%` }}
            />
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {home.package.usedClasses} de {home.package.totalClasses} usadas · desde{" "}
            {formatDateShort(home.package.createdAt)}
          </div>
        </div>
      )}

      <div className="font-display text-[19px] tracking-wide text-foreground mb-2.5">SOLICITAR</div>

      {isLoading && <SkeletonList count={3} height={90} />}

      <div className="flex flex-col gap-2.5">
        {templates?.map((t) => (
          <div key={t.id} className="card-dark p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-foreground">{t.name}</div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">{t.description}</div>
              <div className="text-base text-accent font-semibold mt-1.5">{formatPriceLabel(t.priceCents)}</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 hover:border-primary hover:text-primary"
              onClick={() => request.mutate(t)}
              disabled={request.isPending}
            >
              Pedir
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
