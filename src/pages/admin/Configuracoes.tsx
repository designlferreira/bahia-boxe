import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Switch } from "@/components/ui/switch";
import { getAdminSettings, updateNoShowConsumesClass } from "@/integrations/backend/api";

export default function AdminConfiguracoes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const key = ["admin-settings", profile?.id];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getAdminSettings(profile!.id),
    enabled: !!profile,
  });

  const toggle = useMutation({
    mutationFn: (value: boolean) => updateNoShowConsumesClass(profile!.id, value),
    onSuccess: (_r, value) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast(value ? "Falta passa a consumir crédito" : "Falta não consome mais crédito");
    },
  });

  return (
    <div className="page-container">
      <PageHeader title="CONFIGURAÇÕES" back />

      {isLoading && <SkeletonCard height={80} />}

      {!isLoading && (
        <div className="card-dark p-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-foreground">Falta consome crédito</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              Aluno que não aparece perde a aula do pacote.
            </div>
          </div>
          <Switch
            aria-label="Alternar consumo de crédito na falta"
            checked={data?.noShowConsumesClass ?? true}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </div>
      )}
    </div>
  );
}
