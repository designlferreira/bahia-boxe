import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonList } from "@/components/SkeletonCard";
import { CalendarClock } from "lucide-react";
import { ActivePackageCard } from "@/components/ActivePackageCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { formatPriceLabel } from "@/lib/packageUtils";
import { formatDateShort } from "@/lib/dateUtils";
import {
  getModoAgendamentoEfetivo,
  getPackageTemplates,
  getStudentAdminId,
  getStudentHome,
  getWhatsappDoProfessor,
  requestPackage,
  requestSingleClass,
} from "@/integrations/backend/api";
import type { PackageTemplate } from "@/integrations/backend/types";

export default function StudentPacotes() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Tocar em "Pedir" só ESCOLHE o modelo: quem envia é a janela de confirmação (antes um toque já criava o pedido).
  const [escolhido, setEscolhido] = useState<PackageTemplate | null>(null);

  const { data: home, isError: erroHome, refetch: recarregarHome } = useQuery({
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

  // CLAUDE.md, Etapa 7: esta tela CRIA purchase_requests (AUTOSSERVICO — o aluno pede mais
  // crédito pra se auto-agendar). Em RECORRENCIA o aluno não pede nada, o professor gera o pacote
  // direto; redireciona igual a Agendar.tsx, mesmo motivo. Sem risco de encalhar configuração
  // (diferente de AlunoRecorrencia.tsx): esta tela não tem estado próprio pra proteger o acesso.
  const { data: modoEfetivo } = useQuery({
    queryKey: ["modo-agendamento-efetivo", adminId],
    queryFn: () => getModoAgendamentoEfetivo(adminId!),
    enabled: !!adminId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (modoEfetivo === "recorrencia") {
      navigate("/app/historico", { replace: true });
      toast("Seu professor gerencia sua agenda por recorrência — fale com ele para pedir mais aulas.");
    }
  }, [modoEfetivo, navigate]);

  const { data: templates, isLoading, isError: erroModelos, refetch: recarregarModelos } = useQuery({
    queryKey: ["package-templates", adminId],
    queryFn: () => getPackageTemplates(adminId!),
    enabled: !!adminId && modoEfetivo !== "recorrencia",
  });

  // Canal do aluno com o professor (mesmo da Home): sem número cadastrado, o botão do vazio não aparece.
  const { data: whatsapp } = useQuery({
    queryKey: ["whatsapp-professor", adminId],
    queryFn: () => getWhatsappDoProfessor(adminId!),
    enabled: !!adminId,
    staleTime: 60 * 60 * 1000,
  });

  const request = useMutation({
    mutationFn: (t: PackageTemplate) =>
      t.totalClasses > 1 ? requestPackage(t.id) : requestSingleClass(`Pedido a partir de "${t.name}"`),
    onSuccess: (_r, t) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      // A Home mostra o pedido em espera no lugar do "solicitar" — sem invalidar, ela continuaria
      // pedindo pra solicitar o que o aluno acabou de solicitar.
      queryClient.invalidateQueries({ queryKey: ["student-home"] });
      toast.success(`Pedido enviado: ${t.name}. O professor vai responder.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível enviar o pedido."),
  });

  const aguardandoModo = modoEfetivo === undefined;
  const pedido = home?.pendingRequest ?? null;
  const pedidoNome = pedido?.kind === "package" ? "pacote" : "aula avulsa";
  const pedidoModelo = pedido?.templateId ? templates?.find((t) => t.id === pedido.templateId) : undefined;

  // O que o aluno precisa saber ANTES de pedir: quem decide é o professor (pagamento combinado com ele) e liberar um pacote novo
  // encerra o atual — as aulas sem data deixam de valer, as já marcadas continuam (regra do banco: aprovar encerra o pacote
  // ativo não experimental; a aula experimental fica).
  const atual = home?.package && home.package.origin !== "trial" ? home.package : null;
  const restantesAtual = atual ? Math.max(0, atual.totalClasses - atual.usedClasses) : 0;
  const semDataAtual = atual ? Math.min(Math.max(home?.credits ?? 0, 0), restantesAtual) : 0;
  const descricaoPedido = escolhido
    ? [
        `${escolhido.name} · ${formatPriceLabel(escolhido.priceCents)}.`,
        "O professor combina o pagamento com você e libera as aulas. Você é avisado quando ele responder.",
        semDataAtual > 0
          ? `Atenção: você ainda tem ${semDataAtual} ${semDataAtual === 1 ? "aula" : "aulas"} sem data no pacote atual. Ao liberar o novo pacote, o atual é encerrado e ${semDataAtual === 1 ? "essa aula deixa" : "essas aulas deixam"} de valer. As aulas já marcadas continuam.`
          : null,
      ]
        .filter(Boolean)
        .join(String.fromCharCode(10, 10))
    : "";

  return (
    <div className="page-container">
      <PageHeader title="MEUS PACOTES" back />

      {/* Só mostra o conteúdo depois de saber o modo: em Recorrência esta tela redireciona, e antes a lista de pedidos aparecia por
          um instante até o redirecionamento. */}
      {aguardandoModo && <SkeletonList count={3} height={90} />}
      {!aguardandoModo && modoEfetivo !== "recorrencia" && (
        <>
      {/* O mesmo cartão de pacote da Home (antes esta tela tinha uma terceira cópia: "8 de 8 usadas" com selo "Ativo", sem "aulas
          restantes" nem o alerta de poucas aulas). Sem alerta aqui: a lista logo abaixo já É o "pedir mais". */}
      {!home && !erroHome && <SkeletonCard height={120} className="mb-6" />}
      {home && (home.package ?? home.lastPackage) && (
        <div className="mb-6">
          <ActivePackageCard pkg={home.package ?? home.lastPackage} credits={home.credits} audience="student" hideAlert />
        </div>
      )}

      {/* Pedido em espera: a tela já recebe o pedido (`home.pendingRequest`, o mesmo que a Home mostra) e antes o ignorava —
          os "Pedir" seguiam ativos e o aluno podia mandar outro, e cada pedido aprovado encerra o pacote atual. Âmbar =
          depende do professor. */}
      {pedido && (
        <div role="status" className="rounded-2xl border border-amber/40 bg-amber/10 p-4 mb-6">
          <div className="text-[15px] font-semibold text-amber">
            Pedido de {pedidoNome} enviado
            {pedidoModelo ? ` · ${pedidoModelo.name}` : ""}
          </div>
          <div className="text-[13px] text-foreground/85 mt-1">
            Enviado em {formatDateShort(pedido.createdAt)}. Aguardando o professor responder.
          </div>
        </div>
      )}

      <h2 className="section-title mb-3">Pedir mais aulas</h2>
      {pedido && (
        <p id="pedido-motivo" className="text-[13px] text-muted-foreground -mt-1.5 mb-3">
          Você já tem um pedido com o professor. Espere a resposta para pedir outro.
        </p>
      )}

      {isLoading && <SkeletonList count={3} height={90} />}

      {/* Antes uma falha nas consultas deixava a tela em branco (a lista vazia) — o aluno concluía que não há pacotes. Sem o `home`
          os "Pedir" ficam desativados (não dá para saber se há pedido pendente), então o erro dele também precisa de saída. */}
      {(erroModelos || erroHome) && (
        <ErrorState
          title="Não foi possível carregar os pacotes"
          onRetry={() => {
            if (erroModelos) recarregarModelos();
            if (erroHome) recarregarHome();
          }}
        />
      )}

      {!isLoading && !erroModelos && templates && templates.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="Seu professor ainda não cadastrou pacotes"
          description="Fale com ele para combinar suas próximas aulas."
          ctaLabel={whatsapp ? "Falar com o professor" : undefined}
          ctaVariant="secondary"
          onCta={
            whatsapp
              ? () => window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Aqui é ${profile?.name.split(" ")[0] ?? ""}.`)}`, "_blank", "noopener")
              : undefined
          }
        />
      )}

      <ul aria-label="Modelos de pacote" className="flex flex-col gap-2.5">
        {templates?.map((t) => (
          <li key={t.id} className="card-dark p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {/* Nome e descrição têm limite: um texto longo do professor fazia o cartão passar de 400px de altura. */}
              <div className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2 break-words">{t.name}</div>
              {t.description && <div className="text-[12.5px] text-muted-foreground mt-0.5 line-clamp-3 break-words">{t.description}</div>}
              {t.validityDays ? (
                // Só informativo: o pacote não vence sozinho (não há data de expiração no banco).
                <div className="text-[12.5px] text-muted-foreground mt-0.5">Sugestão: use em até {t.validityDays} dias</div>
              ) : null}
              {/* "Preço a combinar" é ausência de preço, não um preço: neutro, não dourado grande (que parecia um valor). */}
              <div
                className={
                  t.priceCents === null ? "text-[13px] text-muted-foreground mt-1.5" : "text-base text-accent font-semibold mt-1.5"
                }
              >
                {formatPriceLabel(t.priceCents)}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 hover:border-primary hover:text-primary"
              onClick={() => setEscolhido(t)}
              // Desativado enquanto há pedido em espera (e enquanto a Home ainda não chegou: sem ela não dá para saber).
              disabled={request.isPending || !home || !!pedido}
              // Sem isso o leitor de tela ouvia "Pedir, Pedir, Pedir" sem saber qual modelo (o nome fica num <div> irmão).
              aria-label={`Pedir ${t.name}`}
              aria-describedby={pedido ? "pedido-motivo" : undefined}
            >
              Pedir
            </Button>
          </li>
        ))}
      </ul>
        </>
      )}

      <ConfirmDialog
        open={!!escolhido}
        onOpenChange={(o) => {
          if (!o) setEscolhido(null);
        }}
        title={escolhido ? `PEDIR ${escolhido.name.toUpperCase()}` : "PEDIR"}
        description={descricaoPedido}
        confirmLabel="Enviar pedido"
        cancelLabel="Voltar"
        tone="default"
        onConfirm={() => escolhido && request.mutate(escolhido)}
      />
    </div>
  );
}
