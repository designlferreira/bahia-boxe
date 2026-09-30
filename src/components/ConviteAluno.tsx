import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { criarConvite } from "@/integrations/backend/api";
import { linkDoConvite, linkWhatsappConvite } from "@/lib/convite";
import { formatDateShort } from "@/lib/dateUtils";
import { mensagemDeErro } from "@/lib/erros";
import { CONVITES_EM_ABERTO_KEY, ConvitesEmAberto } from "@/components/ConvitesEmAberto";

interface Convite {
  token: string;
  expiresAt: string;
}

/**
 * Convidar um aluno: o professor gera um link (uso único), manda pelo WhatsApp e o aluno cria a conta por ele.
 * O convite só é criado quando o professor toca em "Gerar link" — abrir a janela só para olhar não deixa convite solto no banco.
 * Cada link serve para UM aluno (`accept_invite` marca como usado); para outra pessoa, gera-se outro.
 */
export function ConviteCorpo({ amostra, onCriado }: { amostra?: Convite; onCriado?: (token: string | null) => void } = {}) {
  const queryClient = useQueryClient();
  const [convite, setConvite] = useState<Convite | null>(amostra ?? null);
  const [copiado, setCopiado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const gerar = useMutation({
    mutationFn: criarConvite,
    onSuccess: (c) => {
      setConvite(c);
      setCopiado(false);
      onCriado?.(c.token);
      // A lista de convites em aberto (janela e aviso da lista de alunos) passa a contar o novo.
      queryClient.invalidateQueries({ queryKey: [CONVITES_EM_ABERTO_KEY] });
    },
  });

  // O "Copiado" volta ao normal sozinho: senão o botão ficaria dizendo que copiou um link de antes.
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  const link = convite ? linkDoConvite(convite.token) : "";
  const validoAte = convite ? formatDateShort(convite.expiresAt) : "";

  async function copiar() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      // Sem permissão da área de transferência (ou contexto sem ela): seleciona o link para a pessoa copiar à mão.
      campo.current?.focus();
      campo.current?.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    setCopiado(ok);
    if (!ok) campo.current?.select();
  }

  if (!convite) {
    return (
      <div>
        <p className="text-[14px] text-foreground/85 leading-relaxed mb-1">
          Você gera um link, manda pelo WhatsApp e o aluno cria a conta por ele. Cada link serve para um aluno só.
        </p>
        <p className="text-[13px] text-muted-foreground mb-4">Quando ele entrar, já aparece na sua lista de alunos.</p>
        {gerar.isError && (
          <p role="alert" className="text-[13px] text-[hsl(var(--red-text))] mb-3">
            {mensagemDeErro(gerar.error, "Não foi possível criar o convite. Tente de novo.")}
          </p>
        )}
        <Button size="lg" className="w-full" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          {gerar.isPending ? "Gerando…" : gerar.isError ? "Tentar de novo" : "Gerar link de convite"}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[14px] text-foreground/85 leading-relaxed mb-3">
        Link pronto. Vale para um aluno e até {validoAte.replace(" ", " ")}.
      </p>
      <label className="block text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5" htmlFor="link-convite">
        Link do convite
      </label>
      <input
        id="link-convite"
        ref={campo}
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="input-dark w-full h-12 px-3 text-[13px] mb-3 text-foreground/90"
      />
      <div className="flex flex-col gap-2.5">
        <Button size="lg" className="w-full" asChild>
          <a href={linkWhatsappConvite(link, validoAte)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-[18px] w-[18px] mr-2" aria-hidden />
            Enviar pelo WhatsApp
          </a>
        </Button>
        <Button size="lg" variant="secondary" className="w-full" onClick={copiar}>
          {copiado ? <Check className="h-[18px] w-[18px] mr-2" aria-hidden /> : <Copy className="h-[18px] w-[18px] mr-2" aria-hidden />}
          {copiado ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copiado ? "Link copiado." : ""}
      </p>
      <div className="mt-3 text-[12.5px] text-muted-foreground">
        Para convidar outra pessoa, gere outro link.{" "}
        <button
          type="button"
          onClick={() => {
            setConvite(null);
            gerar.reset();
            // O link que saiu de cena volta a contar como "em aberto" na lista logo abaixo.
            onCriado?.(null);
          }}
          className="underline underline-offset-2 text-foreground/85 min-h-11 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Gerar outro
        </button>
      </div>
    </div>
  );
}

export function ConviteSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (aberto: boolean) => void }) {
  // O convite recém-gerado já aparece em destaque no corpo da janela: a lista de "em aberto" não o repete.
  const [recente, setRecente] = useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>CONVIDAR ALUNO</SheetTitle>
        <SheetDescription className="sr-only">Gere um link de convite de uso único e envie ao aluno.</SheetDescription>
        <div className="mt-2">
          <ConviteCorpo onCriado={setRecente} />
          <ConvitesEmAberto excluirToken={recente} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
