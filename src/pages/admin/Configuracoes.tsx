import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, ChevronRight, MapPin } from "lucide-react";
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
import { mensagemDeErro } from "@/lib/erros";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
      toast(value ? "Falta agora desconta uma aula" : "Falta não desconta mais a aula");
    },
    // Antes uma falha de gravação sumia em silêncio (só o WhatsApp avisava) e o switch voltava sozinho.
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível salvar. Tente de novo.")),
  });

  const toggleModo = useMutation({
    mutationFn: (value: ModoAgendamento) => updateModoAgendamento(profile!.id, value),
    onSuccess: (_r, value) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast(value === "recorrencia" ? "Modo Recorrência ativado" : "Modo Autosserviço ativado");
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível trocar o modo. Tente de novo.")),
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
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível salvar.")),
  });

  return (
    <div className="page-container">
      <PageHeader title="CONFIGURAÇÕES" back />

      {isError && !isLoading && <ErrorState onRetry={() => refetch()} />}

      {isLoading && <SkeletonCard height={80} />}
      {isLoading && <SkeletonCard height={120} className="mt-3.5" />}

      {!isLoading && !isError && (
        <>
          <h2 className="section-title mb-2.5">Como os alunos agendam</h2>
        <div className="card-dark p-4">
          <div id="modo-titulo" className="text-[14.5px] font-semibold text-foreground">Modo de agendamento</div>
          <div id="modo-descricao" className="text-[12.5px] text-muted-foreground mt-0.5">
            Autosserviço: o aluno escolhe o horário entre os que você publicou. Recorrência: você combina horários fixos com
            cada aluno e gera as aulas.
          </div>
          <div role="group" aria-labelledby="modo-titulo" aria-describedby="modo-descricao" className="flex gap-2 mt-3">
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
                    `flex-1 h-11 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 ${FOCO}`,
                    // Selecionado é neutro (invertido) com ✓: o vermelho fica para a ação principal de cada tela,
                    // e a marca não depende só da cor.
                    active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-2.5">
            Ao trocar, as aulas e os pacotes que já existem não mudam. A troca vale só para o que vier depois.
          </div>
        </div>
        </>
      )}

      {!isLoading && !isError && (
        <>
          <h2 className="section-title mt-6 mb-2.5">Regras do pacote</h2>
        <div className="card-dark p-4 flex items-center gap-3">
          <div className="flex-1">
            <div id="falta-titulo" className="text-[14.5px] font-semibold text-foreground">Falta desconta uma aula</div>
            <div id="falta-descricao" className="text-[12.5px] text-muted-foreground mt-0.5">
              Se o aluno não aparecer, a aula é descontada do pacote. Pacotes de Recorrência já gerados mantêm a regra que valia
              quando foram criados.
            </div>
          </div>
          <Switch
            aria-labelledby="falta-titulo"
            aria-describedby="falta-descricao"
            checked={data?.noShowConsumesClass ?? true}
            disabled={toggle.isPending}
            onCheckedChange={(v) => toggle.mutate(v)}
          />
        </div>
        </>
      )}

      {!isLoading && !isError && (
        <>
          <h2 className="section-title mt-6 mb-2.5">Contato</h2>
        <div className="card-dark p-4">
          <label htmlFor="whatsapp" className="text-[14.5px] font-semibold text-foreground">
            WhatsApp para os alunos
          </label>
          <div id="whatsapp-descricao" className="text-[12.5px] text-muted-foreground mt-0.5">
            Aparece na tela inicial do aluno como "Falar com o professor". Deixe em branco para não mostrar.
          </div>
          <input
            id="whatsapp"
            maxLength={20}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 94703-4983"
            value={whatsappInput}
            onChange={(e) => setWhatsappInput(e.target.value)}
            aria-invalid={whatsappInvalido}
            aria-describedby={whatsappInvalido ? "whatsapp-descricao whatsapp-erro" : "whatsapp-descricao"}
            className="input-dark h-12 mt-3"
          />
          {whatsappInvalido && (
            <div id="whatsapp-erro" role="alert" className="text-[13px] text-[hsl(var(--red-text))] mt-2">
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
        </>
      )}

      <h2 className="section-title mt-6 mb-2.5">O que o aluno vê</h2>
      <button
        type="button"
        onClick={() => navigate("/admin/orientacoes")}
        className={`w-full text-left card-dark p-4 flex items-center gap-3 active:scale-[0.99] transition-transform ${FOCO}`}
      >
        <div className="h-10 w-10 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
          <MapPin className="h-[18px] w-[18px] text-foreground/80" aria-hidden />
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold text-foreground">Orientações da aula</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">Local, antecedência e equipamento — mostrados ao aluno</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      </button>


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
