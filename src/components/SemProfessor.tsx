import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/integrations/backend/api";
import { extrairTokenDeConvite } from "@/lib/vinculo";
import { mensagemDeErro } from "@/lib/erros";
import { limparConvitePendente } from "@/lib/convitePendente";

interface SemProfessorProps {
  onVerificar: () => void;
  verificando?: boolean;
  onSair: () => void;
}

/**
 * Tela do aluno cuja conta existe mas ainda não está ligada a um professor (criou a conta sem o link do convite, ou o convite
 * venceu/já foi usado/se perdeu ao abrir o e-mail em outro aparelho). Em vez de "Não foi possível carregar" em todas as telas,
 * explica o que falta e deixa resolver na hora: abrir o link ou COLAR o link aqui (usa o mesmo `accept_invite` do fluxo normal).
 */
export function SemProfessor({ onVerificar, verificando = false, onSair }: SemProfessorProps) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const entrar = useMutation({
    mutationFn: async (token: string) => acceptInvite(token),
    onSuccess: () => {
      limparConvitePendente();
      // Tudo que foi lido antes do vínculo está errado ou vazio: recomeça as consultas, e o app do aluno volta no lugar desta tela.
      queryClient.invalidateQueries();
    },
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const token = extrairTokenDeConvite(texto);
    if (!token) {
      setErroLocal("Não achei um convite aí. Cole o link inteiro que seu professor mandou.");
      return;
    }
    setErroLocal(null);
    entrar.mutate(token);
  }

  // `accept_invite` responde em inglês ("Invalid or expired invite") para convite usado, vencido ou inexistente.
  const erroServidor = entrar.isError
    ? /invalid or expired/i.test(entrar.error instanceof Error ? entrar.error.message : "")
      ? "Esse convite já foi usado ou venceu. Peça um novo link ao seu professor."
      : mensagemDeErro(entrar.error, "Não foi possível usar esse convite. Tente de novo.")
    : null;
  const erro = erroLocal ?? erroServidor;

  return (
    <div className="page-container">
      <h1 className="font-display text-[34px] leading-[0.95] tracking-wide text-foreground uppercase mb-3">Só falta o convite</h1>
      <p className="text-[15px] text-foreground/85 leading-relaxed mb-1">
        Sua conta foi criada, mas ainda não está ligada a um professor. É pelo convite que você vê suas aulas e agenda horários.
      </p>
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-5">
        Abra o link que seu professor mandou. Se já abriu e chegou aqui, cole o link abaixo.
      </p>

      <form onSubmit={enviar} noValidate>
        <label htmlFor="link-convite-aluno" className="block text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
          Link do convite
        </label>
        <input
          id="link-convite-aluno"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErroLocal(null);
            if (entrar.isError) entrar.reset();
          }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Cole o link aqui"
          aria-invalid={!!erro}
          aria-describedby={erro ? "erro-convite-aluno" : undefined}
          className="input-dark w-full h-12 px-3 text-[14px] mb-2 text-foreground"
        />
        {erro && (
          <p id="erro-convite-aluno" role="alert" className="text-[13px] text-[hsl(var(--red-text))] mb-2">
            {erro}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full mt-1" disabled={entrar.isPending || !texto.trim()}>
          {entrar.isPending ? "Entrando…" : "Usar este convite"}
        </Button>
        {!texto.trim() && <p className="text-[12.5px] text-muted-foreground mt-2">Cole o link para continuar.</p>}
      </form>

      <div className="mt-6 pt-5 border-t border-border">
        <p className="text-[13px] text-muted-foreground mb-3">
          Não recebeu o link? Peça ao seu professor para gerar um convite novo. Se ele acabou de ligar sua conta, verifique de novo.
        </p>
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onVerificar} disabled={verificando}>
            {verificando ? "Verificando…" : "Verificar de novo"}
          </Button>
          <Button variant="ghost" className="flex-1 text-[hsl(var(--red-text))]" onClick={onSair}>
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}
