import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SkeletonCard } from "@/components/SkeletonCard";
import { ErrorState } from "@/components/ErrorState";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAdminSettings,
  normalizeWhatsapp,
  updateModoAgendamento,
  updateNoShowConsumesClass,
  updateWhatsapp,
} from "@/integrations/backend/api";
import type { ModoAgendamento } from "@/integrations/backend/types";

const MODO_OPTIONS: { value: ModoAgendamento; label: string }[] = [
  { value: "autosservico", label: "Autosserviço" },
  { value: "recorrencia", label: "Recorrência" },
];

/** O que o professor está decidindo, em termos do que o ALUNO passa a ver (não "fluxo" nem "dados"). */
const MODO_CONFIRMACAO: Record<ModoAgendamento, { title: string; description: string; confirmLabel: string }> = {
  recorrencia: {
    title: "TROCAR PARA RECORRÊNCIA?",
    description:
      "Seus alunos deixam de ver \"Agendar\" e passam a ver \"Ver minhas aulas\": quem marca as aulas é você, nos horários fixos de cada aluno. Pacotes e aulas que já existem não mudam.",
    confirmLabel: "Trocar para Recorrência",
  },
  autosservico: {
    title: "TROCAR PARA AUTOSSERVIÇO?",
    description:
      "Seus alunos voltam a escolher o horário na sua disponibilidade publicada e a ver \"Agendar\". Horários fixos e aulas que já existem não mudam.",
    confirmLabel: "Trocar para Autosserviço",
  },
};

export default function AdminConfiguracoes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const key = ["admin-settings", profile?.id];

  // Modo escolhido, esperando confirmação: só grava depois do "Trocar" (decisão do Lucas).
  const [modoPendente, setModoPendente] = useState<ModoAgendamento | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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
    // Antes uma falha de gravação sumia em silêncio (só o WhatsApp avisava) e o switch voltava sozinho.
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo."),
  });

  const toggleModo = useMutation({
    mutationFn: (value: ModoAgendamento) => updateModoAgendamento(profile!.id, value),
    onSuccess: (_r, value) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast(value === "recorrencia" ? "Modo Recorrência ativado" : "Modo Autosserviço ativado");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível trocar o modo. Tente de novo."),
  });

  // WhatsApp que os alunos usam pra falar com o professor (0032).
  const [whatsappInput, setWhatsappInput] = useState("");
  useEffect(() => {
    if (data) setWhatsappInput(data.whatsapp ? formatWhatsapp(data.whatsapp) : "");
  }, [data?.whatsapp]); // eslint-disable-line react-hooks/exhaustive-deps
  const whatsappNormalizado = whatsappInput.trim() ? normalizeWhatsapp(whatsappInput) : null;
  const whatsappInvalido = !!whatsappInput.trim() && !whatsappNormalizado;
  const whatsappMudou = (whatsappNormalizado ?? null) !== (data?.whatsapp ?? null);

  const saveWhatsapp = useMutation({
    mutationFn: () => updateWhatsapp(profile!.id, whatsappNormalizado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success(whatsappNormalizado ? "WhatsApp salvo" : "WhatsApp removido");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível salvar."),
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

      {isError && !isLoading && <ErrorState onRetry={() => refetch()} />}

      {isLoading && <SkeletonCard height={80} />}
      {isLoading && <SkeletonCard height={120} className="mt-3.5" />}

      {!isLoading && !isError && (
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
            disabled={toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </div>
      )}

      {!isLoading && !isError && (
        <div className="card-dark p-4 mt-3.5">
          <div className="text-[14.5px] font-semibold text-foreground">Modo de agendamento</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">
            Autosserviço: o aluno escolhe o horário na sua disponibilidade publicada. Recorrência:
            você define dias fixos por aluno e gera os pacotes de aulas.
          </div>
          <div className="flex gap-2 mt-3">
            {MODO_OPTIONS.map((opt) => {
              const active = (data?.modoAgendamento ?? "autosservico") === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  disabled={toggleModo.isPending}
                  // Tocar no modo que já está ativo não faz nada (antes gravava de novo à toa).
                  onClick={() => !active && setModoPendente(opt.value)}
                  className={cn(
                    "flex-1 h-10 rounded-xl text-[13px] font-semibold transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="text-[11.5px] text-muted-foreground/80 mt-2.5">
            Trocar aqui não migra nenhum dado: pacotes e aulas já criados continuam exatamente como
            estão, nos dois modos. Isto só decide qual fluxo fica disponível daqui pra frente.
          </div>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="card-dark p-4 mt-3.5">
          <label htmlFor="whatsapp" className="text-[15px] font-semibold text-foreground">
            WhatsApp para os alunos
          </label>
          <div className="text-sm text-muted-foreground mt-0.5">
            Aparece na tela inicial do aluno como "Falar com o professor". Deixe em branco para não mostrar.
          </div>
          <input
            id="whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 94703-4983"
            value={whatsappInput}
            onChange={(e) => setWhatsappInput(e.target.value)}
            aria-invalid={whatsappInvalido}
            aria-describedby={whatsappInvalido ? "whatsapp-erro" : undefined}
            className="input-dark h-12 mt-3"
          />
          {whatsappInvalido && (
            <div id="whatsapp-erro" className="text-sm text-[hsl(var(--red-text))] mt-2">
              Número incompleto. Use DDD + número, por exemplo (11) 94703-4983.
            </div>
          )}
          <Button
            className="w-full mt-3"
            variant="secondary"
            disabled={!whatsappMudou || whatsappInvalido || saveWhatsapp.isPending}
            onClick={() => saveWhatsapp.mutate()}
          >
            {saveWhatsapp.isPending ? "Salvando…" : "Salvar WhatsApp"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!modoPendente}
        onOpenChange={(open) => !open && setModoPendente(null)}
        title={modoPendente ? MODO_CONFIRMACAO[modoPendente].title : ""}
        description={modoPendente ? MODO_CONFIRMACAO[modoPendente].description : ""}
        confirmLabel={modoPendente ? MODO_CONFIRMACAO[modoPendente].confirmLabel : "Trocar"}
        cancelLabel="Cancelar"
        tone="default"
        onConfirm={() => {
          if (modoPendente) toggleModo.mutate(modoPendente);
          setModoPendente(null);
        }}
      />
    </div>
  );
}

/** "5511947034983" -> "+55 (11) 94703-4983" (só pra exibir; o banco guarda só dígitos). */
function formatWhatsapp(digits: string) {
  const m = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}
