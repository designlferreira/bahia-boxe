import { PasswordRule } from "@/components/PasswordRule";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

interface ContaFormProps {
  /** Rótulos do botão principal, parado e enviando. */
  submitLabel: string;
  loadingLabel: string;
  loading: boolean;
  /** Erro do envio (do servidor) — quem chama decide o texto e pode acrescentar um link. */
  error: ReactNode;
  /** Só roda com tudo válido. Lança/trata o próprio erro (o formulário não sabe de convite nem de login). */
  onSubmit: (dados: { name: string; email: string; password: string }) => void | Promise<void>;
}

/**
 * O formulário de cadastro — o MESMO em "Criar conta" e no convite (antes o convite tinha só 3 campos
 * soltos: sem regras da senha, sem "Mostrar", sem confirmar, sem erro por campo e sem preenchimento
 * automático; o aluno só descobria a regra depois de errar).
 */
export function ContaForm({ submitLabel, loadingLabel, loading, error, onSubmit }: ContaFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const ruleLen = password.length >= MIN_PASSWORD;
  const ruleNum = /\d/.test(password);
  const ruleUp = /[A-Z]/.test(password);
  const canSubmit =
    name.trim().length > 0 && EMAIL_RE.test(email.trim()) && ruleLen && ruleNum && ruleUp && password === confirm;

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Informe seu nome completo.";
    if (!email.trim()) errors.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "Digite um e-mail válido.";
    if (!password) errors.password = "Crie uma senha.";
    else if (!ruleLen || !ruleNum || !ruleUp) errors.password = "A senha não atende aos requisitos abaixo.";
    if (confirm !== password) errors.confirm = "As senhas não coincidem.";

    setFieldErrors(errors);
    if (errors.name) nameRef.current?.focus();
    else if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    else if (errors.confirm) confirmRef.current?.focus();
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return; // guards a double tap on the CTA
    if (!validate()) return;
    void onSubmit({ name, email, password });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
      <div>
        <Label htmlFor="name">Nome completo</Label>
        <Input
          id="name"
          maxLength={80}
          ref={nameRef}
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
          }}
          onBlur={(e) => {
            setFieldErrors((f) => ({ ...f, name: e.target.value.trim() ? undefined : "Informe seu nome completo." }));
          }}
          placeholder="Seu nome"
          aria-invalid={!!fieldErrors.name}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        {fieldErrors.name && (
          <div id="name-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
            {fieldErrors.name}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          maxLength={254}
          ref={emailRef}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            const err = !v ? undefined : !EMAIL_RE.test(v) ? "Digite um e-mail válido." : undefined;
            setFieldErrors((f) => ({ ...f, email: err }));
          }}
          placeholder="voce@email.com"
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <div id="email-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
            {fieldErrors.email}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="password" className="mb-0">
            Senha
          </Label>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="text-accent text-xs font-semibold flex items-center gap-1 min-h-11 px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <Input
          id="password"
          maxLength={72}
          ref={passwordRef}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
          placeholder="Mínimo 8 caracteres"
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? "password-error" : "password-rules"}
        />
        <div id="password-rules" className="flex flex-col gap-1.5 mt-2">
          <PasswordRule ok={ruleLen} label="Pelo menos 8 caracteres" />
          <PasswordRule ok={ruleNum} label="Pelo menos 1 número" />
          <PasswordRule ok={ruleUp} label="Pelo menos 1 letra maiúscula" />
        </div>
        {fieldErrors.password && (
          <div id="password-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
            {fieldErrors.password}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input
          id="confirm"
          maxLength={72}
          ref={confirmRef}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (fieldErrors.confirm) setFieldErrors((f) => ({ ...f, confirm: undefined }));
          }}
          onBlur={(e) => {
            const v = e.target.value;
            setFieldErrors((f) => ({ ...f, confirm: v && v !== password ? "As senhas não coincidem." : undefined }));
          }}
          placeholder="Repita a senha"
          aria-invalid={!!fieldErrors.confirm}
          aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
        />
        {fieldErrors.confirm && (
          <div id="confirm-error" role="alert" className="text-[12.5px] text-destructive mt-1.5">
            {fieldErrors.confirm}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/35 bg-destructive/10 p-3.5 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="mt-1.5" disabled={!canSubmit || loading} aria-describedby={!canSubmit ? "submit-dica" : undefined}>
        {loading ? loadingLabel : submitLabel}
      </Button>
      {!canSubmit && !loading && (
        <div id="submit-dica" className="text-center text-[13px] text-muted-foreground -mt-1">
          Preencha seus dados e siga as regras da senha para continuar.
        </div>
      )}
    </form>
  );
}
