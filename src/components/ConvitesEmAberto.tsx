import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cancelarConvite, getConvitesEmAberto, restaurarConvite, type ConviteEmAberto } from "@/integrations/backend/api";
import { linkDoConvite, linkWhatsappConvite } from "@/lib/convite";
import { formatDateShort } from "@/lib/dateUtils";
import { mensagemDeErro } from "@/lib/erros";

export const CONVITES_EM_ABERTO_KEY = "convites-em-aberto";

/** Convites do professor que ainda esperam o aluno entrar (a mesma consulta alimenta a janela e o aviso da lista de alunos). */
export function useConvitesEmAberto() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [CONVITES_EM_ABERTO_KEY, profile?.id],
    queryFn: () => getConvitesEmAberto(profile!.id),
    enabled: !!profile,
  });
}

const DOIS_DIAS = 2 * 24 * 60 * 60 * 1000;

/**
 * Convites que ainda não foram usados, dentro da janela "Convidar aluno": dá para mandar o mesmo link de novo (o aluno perdeu a
 * mensagem), copiar ou cancelar. Cancelar vence o convite agora e tem "Desfazer" (8s). Quem já entrou não aparece: o servidor o marca usado.
 * `excluirToken` esconde o convite que acabou de ser gerado na janela (ele já está em destaque logo acima).
 */
export function ConvitesEmAberto({ excluirToken, amostra }: { excluirToken?: string | null; amostra?: ConviteEmAberto[] } = {}) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const consulta = useConvitesEmAberto();
  const lista = (amostra ?? consulta.data ?? []).filter((c) => c.token !== excluirToken);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: [CONVITES_EM_ABERTO_KEY, profile?.id] });

  const cancelar = useMutation({
    mutationFn: (c: ConviteEmAberto) => cancelarConvite(c.id),
    onSuccess: (_r, c) => {
      atualizar();
      toast(c.nomeConvidado ? `Convite de ${c.nomeConvidado} cancelado` : "Convite cancelado", {
        description: "Quem abrir esse link vai ver que o convite venceu.",
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: () =>
            restaurarConvite(c.id, c.expiresAt)
              .then(() => {
                atualizar();
                toast.success("Convite de volta");
              })
              .catch((err) => toast.error(mensagemDeErro(err, "Não foi possível desfazer."))),
        },
      });
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível cancelar o convite.")),
  });

  async function copiar(c: ConviteEmAberto) {
    try {
      await navigator.clipboard.writeText(linkDoConvite(c.token));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Use o botão do WhatsApp.");
    }
  }

  if (!amostra && consulta.isError) {
    // A janela continua servindo para gerar convite; só a lista falhou.
    return (
      <p role="alert" className="mt-6 text-[13px] text-muted-foreground">
        Não foi possível carregar seus convites em aberto.{" "}
        <button type="button" onClick={() => consulta.refetch()} className="underline underline-offset-2 text-foreground/85 min-h-11 px-1">
          Tentar de novo
        </button>
      </p>
    );
  }
  if (lista.length === 0) return null;

  return (
    <section aria-labelledby="convites-abertos" className="mt-6 pt-5 border-t border-border">
      <h3 id="convites-abertos" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
        Convites em aberto ({lista.length})
      </h3>
      <p className="text-[12.5px] text-muted-foreground mb-3">Links que ainda não foram usados. Quando o aluno entra, o convite sai daqui.</p>
      <ul className="flex flex-col gap-2.5">
        {lista.map((c) => {
          const venceLogo = new Date(c.expiresAt).getTime() - Date.now() < DOIS_DIAS;
          const validoAte = formatDateShort(c.expiresAt);
          const link = linkDoConvite(c.token);
          const quem = c.nomeConvidado ?? `criado em ${formatDateShort(c.createdAt)}`;
          return (
            <li key={c.id} className="card-dark p-3">
              {/* O nome é a forma de reconhecer o convite; sem nome (convites antigos ou sem rótulo) fica a data. */}
              <div className="text-[14.5px] font-semibold text-foreground break-words line-clamp-2">
                {c.nomeConvidado ?? "Convite sem nome"}
              </div>
              <div className="text-[12.5px] text-muted-foreground">Criado em {formatDateShort(c.createdAt)}</div>
              <div className={venceLogo ? "text-[12.5px] text-amber" : "text-[12.5px] text-muted-foreground"}>
                {venceLogo ? `Vence logo: vale até ${validoAte}` : `Vale até ${validoAte}`}
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="soft" className="flex-1 min-w-0 px-3" asChild>
                  <a href={linkWhatsappConvite(link, validoAte, c.nomeConvidado)} target="_blank" rel="noopener noreferrer" aria-label={`Enviar pelo WhatsApp o convite de ${quem}`}>
                    <MessageCircle className="h-4 w-4 mr-1.5" aria-hidden />
                    Enviar
                  </a>
                </Button>
                <Button size="sm" variant="secondary" className="flex-1 min-w-0 px-3" onClick={() => copiar(c)} aria-label={`Copiar o link do convite de ${quem}`}>
                  <Copy className="h-4 w-4 mr-1.5" aria-hidden />
                  Copiar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 px-3 text-[hsl(var(--red-text))]"
                  onClick={() => cancelar.mutate(c)}
                  disabled={cancelar.isPending && cancelar.variables?.id === c.id}
                  aria-label={`Cancelar o convite de ${quem}`}
                >
                  Cancelar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
