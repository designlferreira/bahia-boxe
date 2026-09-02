import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonCard } from "@/components/SkeletonCard";
import { Switch } from "@/components/ui/switch";
import { getAdminSettings, updateNoShowConsumesClass } from "@/integrations/backend/api";

export default function AdminConfiguracoes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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

      <button
        type="button"
        onClick={() => navigate("/admin/orientacoes")}
        className="w-full text-left card-dark p-4 flex items-center gap-3 mb-3.5 active:scale-[0.99] transition-transform"
      >
        <div className="h-10 w-10 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
          <MapPin className="h-[18px] w-[18px] text-foreground/80" />
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold text-foreground">Orientações da aula</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">Local, antecedência e equipamento — mostrados ao aluno</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

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
