import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PasswordRule } from "@/components/PasswordRule";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { changePassword, AuthError } from "@/integrations/backend/auth";

const SENHA_DE_AMOSTRA = "Amostra123";

/** `amostra`: só para a página de amostras de desenvolvimento (abre a tela já num estado); não tem efeito no app. */
export default function AlterarSenha({ backTo, amostra }: { backTo: string; amostra?: "erro-atual" | "erro-geral" | "sucesso" }) {
  const navigate = useNavigate();
  const currentRef = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState(false);
  const [current, setCurrent] = useState(amostra ? "SenhaAtual1" : "");
  const [next, setNext] = useState(amostra ? SENHA_DE_AMOSTRA : "");
  const [confirm, setConfirm] = useState(amostra ? SENHA_DE_AMOSTRA : "");
  const [loading, setLoading] = useState(false);
  // Dois erros, cada um no seu lugar: o da senha atual fica EMBAIXO do campo dela (e leva o foco); o resto (conexão, servidor,
  // senha fraca) fica embaixo do botão. Antes havia um só, longe do campo, e o campo da senha atual era marcado inválido por qualquer falha.
  const [errorCurrent, setErrorCurrent] = useState<string | null>(
    amostra === "erro-atual" ? "Senha atual incorreta. Confira e tente de novo." : null,
  );
  const [errorGeral, setErrorGeral] = useState<string | null>(
    amostra === "erro-geral" ? "Não foi possível alterar a senha. Verifique sua conexão e tente de novo." : null,
  );
  const [done, setDone] = useState(amostra === "sucesso");
  const tituloSucessoRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Na galeria (`amostra`) não move o foco: ele rolaria a página até este quadro ao abrir.
    if (done && !amostra) tituloSucessoRef.current?.focus();
  }, [done, amostra]);

  // O foco volta DEPOIS do envio terminar: durante ele os campos estão desativados (`fieldset disabled`) e não aceitam foco.
  const botaoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (loading || amostra) return;
    if (errorCurrent) currentRef.current?.focus();
    else if (errorGeral) botaoRef.current?.focus();
  }, [loading, errorCurrent, errorGeral, amostra]);

  function limparErros() {
    setErrorCurrent(null);
    setErrorGeral(null);
  }

  const ruleLen = next.length >= 8;
  const ruleNum = /\d/.test(next);
  const ruleUp = /[A-Z]/.test(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  const igualAtual = current.length > 0 && next === current;
  const canSubmit = current.length > 0 && ruleLen && ruleNum && ruleUp && next === confirm && !igualAtual;
  // Por que o botão está apagado (o primeiro motivo pendente), em texto: só a opacidade não diz o que falta.
  const motivo =
    loading || canSubmit
      ? null
      : current.length === 0
        ? "Digite sua senha atual."
        : !(ruleLen && ruleNum && ruleUp)
          ? "A nova senha ainda não segue todas as regras."
          : igualAtual
            ? "Escolha uma senha diferente da atual."
            : "As duas senhas precisam ser iguais.";

  // Campos preenchidos e ainda não enviados: sair pela seta de voltar pede confirmação e fechar/recarregar a aba pergunta.
  // (As abas de baixo do app não dá para interceptar: BrowserRouter, sem `useBlocker`.)
  const [ajudaAtual, setAjudaAtual] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const mudou = !done && !amostra && (current.length > 0 || next.length > 0 || confirm.length > 0);
  useEffect(() => {
    if (!mudou) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [mudou]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    limparErros();
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      if (err instanceof AuthError && err.code === "senha_atual_incorreta") {
        setErrorCurrent(err.message);
      } else {
        setErrorGeral(err instanceof AuthError ? err.message : "Não foi possível alterar a senha. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="ALTERAR SENHA" back onBack={() => (mudou ? setConfirmarSaida(true) : navigate(-1))} />

      {!done ? (
        // O <form> envolve os CAMPOS: antes só envolvia o botão, e o Enter num campo não enviava (nem o "Ir" do teclado do celular),
        // e o gerenciador de senhas não reconhecia o formulário.
        <form onSubmit={handleSubmit} noValidate className="card-dark p-[18px]">
         {/* Durante o envio os campos não podem mudar (`fieldset disabled`). */}
         <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
          <div className="flex justify-between items-center mb-1.5">
            <Label htmlFor="current" className="mb-0">
              Senha atual
            </Label>
            {/* Vale para os TRÊS campos, então o nome diz "senhas". Alvo de 44px (margem negativa mantém a linha do rótulo compacta),
                foco visível e estado anunciado, como na tela de Nova senha. */}
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar senhas" : "Mostrar senhas"}
              aria-pressed={show}
              className="text-accent text-xs font-semibold flex items-center gap-1 min-h-11 -my-3 px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {show ? "Ocultar senhas" : "Mostrar senhas"}
            </button>
          </div>
          <Input
            id="current"
            maxLength={72}
            ref={currentRef}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              limparErros();
            }}
            placeholder="Sua senha de hoje"
            className={errorCurrent ? "" : "mb-3.5"}
            aria-invalid={!!errorCurrent}
            aria-describedby={errorCurrent ? "current-error" : undefined}
          />
          {errorCurrent && (
            <div id="current-error" role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-2 mb-3.5">
              {errorCurrent}
            </div>
          )}
          {/* Quem chega sem lembrar a senha atual não tinha saída. O caminho existe (Recuperar senha), mas exige sair da conta:
              a tela explica e NÃO desloga sozinha. */}
          <button
            type="button"
            onClick={() => setAjudaAtual((v) => !v)}
            aria-expanded={ajudaAtual}
            aria-controls="ajuda-senha-atual"
            className="-mt-2 mb-2 min-h-11 rounded-md text-[13px] text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Não lembro minha senha atual
          </button>
          {ajudaAtual && (
            <p id="ajuda-senha-atual" className="rounded-xl bg-secondary p-3.5 text-[13px] leading-relaxed text-foreground mb-3.5">
              Saia da conta e, na tela de entrada, toque em “Esqueceu a senha? Recuperar”. Você recebe um link por e-mail para criar uma
              nova senha.
            </p>
          )}

          <Label htmlFor="next">Nova senha</Label>
          <Input
            id="next"
            maxLength={72}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              limparErros();
            }}
            placeholder="Mínimo 8 caracteres"
            className="mb-3"
            aria-describedby="regras-senha"
          />
          <div id="regras-senha" className="flex flex-col gap-1.5 mb-3.5">
            <PasswordRule ok={ruleLen} label="Pelo menos 8 caracteres" />
            <PasswordRule ok={ruleNum} label="Pelo menos 1 número" />
            <PasswordRule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
          </div>

          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            maxLength={72}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              limparErros();
            }}
            placeholder="Repita a nova senha"
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "confirm-mismatch" : undefined}
          />
          {mismatch && (
            <div id="confirm-mismatch" role="alert" className="text-[12.5px] text-[hsl(var(--red-text))] mt-2">
              As senhas não coincidem.
            </div>
          )}

          {errorGeral && (
            <div
              id="erro-geral"
              role="alert"
              className="mt-3.5 rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-[hsl(var(--red-text))]"
            >
              {errorGeral}
            </div>
          )}

          <Button
            ref={botaoRef}
            type="submit"
            size="lg"
            className="w-full mt-4"
            disabled={!canSubmit || loading}
            aria-describedby={motivo ? "motivo-envio" : undefined}
          >
            {loading ? "Salvando…" : "Alterar senha"}
          </Button>
          {motivo && (
            <p id="motivo-envio" className="text-center text-[13px] text-muted-foreground mt-2.5">
              {motivo}
            </p>
          )}
         </fieldset>
        </form>
      ) : (
        <div role="status" className="card-dark border-accent/30 p-7 text-center animate-bb-up">
          <div className="mx-auto mb-3.5 h-14 w-14 rounded-full bg-accent/15 flex items-center justify-center">
            <CheckCircle2 className="h-[26px] w-[26px] text-accent" aria-hidden />
          </div>
          {/* Foco aqui: o formulário some ao concluir e o foco caía no <body>; o `role="status"` anuncia o cartão. */}
          <h2
            ref={tituloSucessoRef}
            tabIndex={-1}
            className="font-display text-2xl font-normal tracking-wide text-foreground mb-1.5 focus:outline-none"
          >
            SENHA ALTERADA
          </h2>
          <p className="text-[13.5px] text-muted-foreground mb-5">
            Pronto. Você continua conectado neste aparelho e vai usar a nova senha nos próximos acessos.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate(backTo, { replace: true })}>
            Voltar para a conta
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmarSaida}
        onOpenChange={setConfirmarSaida}
        title="SAIR SEM ALTERAR?"
        description="Você começou a preencher e ainda não alterou a senha. Se sair agora, o que digitou será descartado."
        confirmLabel="Sair sem alterar"
        cancelLabel="Continuar aqui"
        onConfirm={() => navigate(-1)}
      />
    </div>
  );
}
