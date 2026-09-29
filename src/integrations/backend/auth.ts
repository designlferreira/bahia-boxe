import { supabase } from "@/integrations/supabase/client";
import type { Profile, Role } from "./types";

export class AuthError extends Error {
  /** Motivo tratado pela tela (ex.: "email_not_confirmed" — o Login oferece reenviar o e-mail). */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

type Listener = (profile: Profile | null) => void;

function client() {
  if (!supabase) throw new AuthError("Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes).");
  return supabase;
}

async function loadProfile(userId: string, email: string | undefined): Promise<Profile | null> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, name, role, created_at")
    .eq("id", userId)
    .maybeSingle();
  // Falha (sem rede, servidor fora, token em renovação) NÃO é "sem perfil": tratar as duas como null jogava a pessoa
  // para o login a cada oscilação de conexão, com a sessão ainda válida. Só a ausência da linha devolve null.
  if (error) throw new AuthError("Não foi possível carregar sua conta agora.", "profile_load_failed");
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role as Role,
    email: email ?? "",
    createdAt: data.created_at,
  };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data } = await client().auth.getSession();
  const session = data.session;
  if (!session) return null;
  return loadProfile(session.user.id, session.user.email ?? undefined);
}

const CHAVE_CONVITE_NA_CONTA = "convite_pendente";

/** Convite gravado na conta no cadastro (ver `signUpWithPassword`). Lê da sessão local, sem chamada de rede. */
export async function lerConviteDaConta(): Promise<string | null> {
  const { data } = await client().auth.getSession();
  const valor = data.session?.user.user_metadata?.[CHAVE_CONVITE_NA_CONTA];
  return typeof valor === "string" && valor ? valor : null;
}

/** Tira o convite dos metadados da conta depois de tentado (usado, expirado ou concluído): não tenta de novo a cada abertura. */
export async function limparConviteDaConta(): Promise<void> {
  await client().auth.updateUser({ data: { [CHAVE_CONVITE_NA_CONTA]: null } });
}

export type SignUpResult =
  | { status: "signed_in"; profile: Profile }
  // Email confirmation is on for this project: the account exists but has no session yet.
  | { status: "needs_confirmation"; email: string }
  // Account created, but no profile row came back (the DB trigger that provisions it may be
  // missing or may not cover this role). Reported rather than silently half-working.
  | { status: "profile_missing"; email: string };

/**
 * `convite`: token do convite do professor. Vai gravado NA CONTA (metadados) e não só no aparelho: com "Confirm email" ligado, o
 * aluno pode abrir o link do e-mail em outro navegador ou aparelho (o app instalado e o navegador do celular não dividem o
 * `localStorage`), e o convite guardado só localmente se perderia em silêncio — conta criada, sem vínculo com o professor.
 */
export async function signUpWithPassword(
  name: string,
  email: string,
  password: string,
  convite?: string,
): Promise<SignUpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client().auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { name: name.trim(), ...(convite ? { [CHAVE_CONVITE_NA_CONTA]: convite } : {}) } },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already registered") || message.includes("already been registered")) {
      throw new AuthError("Já existe uma conta cadastrada com este e-mail.");
    }
    if (message.includes("password")) {
      throw new AuthError("A senha não atende aos requisitos mínimos. Use pelo menos 8 caracteres.");
    }
    if (message.includes("email") && message.includes("invalid")) {
      throw new AuthError("Digite um e-mail válido.");
    }
    if (error.status === 429 || message.includes("rate limit")) {
      throw new AuthError("Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.");
    }
    throw new AuthError("Não foi possível criar sua conta. Tente novamente.");
  }

  // With confirmations on, Supabase does not error on a duplicate e-mail (it avoids leaking who
  // is registered); it returns a user with no identities instead.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new AuthError("Já existe uma conta cadastrada com este e-mail.");
  }

  if (!data.session) {
    return { status: "needs_confirmation", email: normalizedEmail };
  }

  const profile = await loadProfile(data.session.user.id, data.session.user.email ?? undefined);
  if (!profile) {
    return { status: "profile_missing", email: normalizedEmail };
  }
  return { status: "signed_in", profile };
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await client().auth.resend({ type: "signup", email: email.trim().toLowerCase() });
  if (error) {
    if (error.status === 429 || error.message.toLowerCase().includes("rate limit")) {
      throw new AuthError("Aguarde um momento antes de pedir outro e-mail.");
    }
    throw new AuthError("Não foi possível reenviar o e-mail. Tente novamente.");
  }
}

/**
 * "Esqueci minha senha": pede ao Supabase o e-mail com o link de recuperação. O link abre `/auth/reset-password`.
 * Sucesso é sempre neutro (o Supabase não diz se o e-mail existe — a tela também não). Falha de verdade (limite, conexão, servidor)
 * NÃO é engolida: antes a tela só esperava 0,6s e dizia "LINK ENVIADO" sem enviar nada.
 *
 * Depende do painel do Supabase: `<origem do app>/auth/reset-password` precisa estar em Authentication → URL Configuration →
 * Redirect URLs (senão o Supabase manda a pessoa para a Site URL), e o modelo "Reset Password" do e-mail precisa estar em português.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  if (!error) return;
  const message = error.message.toLowerCase();
  if (error.status === 429 || message.includes("rate limit") || message.includes("security purposes")) {
    throw new AuthError("Aguarde um momento antes de pedir outro e-mail.", "rate_limited");
  }
  if (message.includes("invalid") && message.includes("email")) {
    throw new AuthError("Informe um e-mail válido.");
  }
  if (!error.status) {
    throw new AuthError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
  }
  throw new AuthError("Não foi possível enviar o e-mail agora. Tente novamente em instantes.");
}

/**
 * Como a página `/auth/reset-password` foi aberta. O Supabase (fluxo implícito) troca o `#access_token…&type=recovery` do link por
 * uma sessão e LIMPA o hash logo depois — por isso isto é lido UMA vez, quando este módulo é avaliado (antes de qualquer espera):
 * - "recovery": veio de um link de recuperação válido (ainda precisa haver sessão para redefinir);
 * - "error": o link chegou com erro (`#error=access_denied&error_code=otp_expired…`: expirado ou já usado);
 * - "none": aberta sem link (digitando o endereço, ou recarregando depois de o hash ser limpo).
 * Uma sessão comum NÃO basta para redefinir sem a senha atual: quem está logado troca a senha em "Alterar senha", que a exige.
 */
export type EstadoLinkRecuperacao = "recovery" | "error" | "none";
const ESTADO_LINK: EstadoLinkRecuperacao = (() => {
  if (typeof window === "undefined" || window.location.pathname !== "/auth/reset-password") return "none";
  const hash = window.location.hash;
  if (/[#&]error(_code|_description)?=/.test(hash)) return "error";
  if (/[#&]type=recovery/.test(hash)) return "recovery";
  return "none";
})();
export function estadoDoLinkDeRecuperacao(): EstadoLinkRecuperacao {
  return ESTADO_LINK;
}

/** O link de recuperação já virou sessão (o cliente do Supabase termina de processar o hash de forma assíncrona). */
export async function temSessaoDeRecuperacao(): Promise<boolean> {
  const { data } = await client().auth.getSession();
  return !!data.session;
}

/**
 * Define a nova senha da pessoa que abriu o link do e-mail. Diferente de `changePassword`, NÃO pede a senha atual (ela não a tem).
 * Depois de definir, encerra a sessão de recuperação: a pessoa entra no Login com a senha nova (decisão do Lucas, 2026-09-29).
 */
export async function redefinirSenhaPeloLink(newPassword: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) {
    const message = error.message.toLowerCase();
    if (error.code === "same_password" || message.includes("different from the old")) {
      throw new AuthError("Escolha uma senha diferente da anterior.", "same_password");
    }
    if (error.code === "weak_password" || message.includes("password")) {
      throw new AuthError("A senha não atende aos requisitos mínimos. Use pelo menos 8 caracteres.");
    }
    if (message.includes("session") || error.status === 401 || error.status === 403) {
      throw new AuthError("Este link expirou ou já foi usado.", "link_expired");
    }
    if (!error.status) {
      throw new AuthError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    }
    throw new AuthError("Não foi possível redefinir a senha. Tente novamente.");
  }
  await client().auth.signOut();
}

export async function signInWithPassword(email: string, password: string): Promise<Profile> {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    // Only an actual credential rejection should be reported as one. A dropped connection
    // (no status) or a server/gateway problem (403/5xx) would otherwise tell users their
    // password is wrong when it isn't.
    const status = error?.status;
    // "Email not confirmed" chega como 400, igual a uma senha errada. Com "Confirm email" ativo é o
    // caminho de todo aluno novo que tenta entrar antes de abrir o link do e-mail: dizer "senha
    // incorreta" o fazia redefinir a senha em círculos sem nunca saber o problema real.
    if (error?.code === "email_not_confirmed" || /email not confirmed/i.test(error?.message ?? "")) {
      throw new AuthError("Seu e-mail ainda não foi confirmado. Abra o link que enviamos para você.", "email_not_confirmed");
    }
    const isCredentialRejection = status === 400 || status === 401 || status === 422;
    throw new AuthError(
      isCredentialRejection
        ? "E-mail ou senha incorretos."
        : "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
    );
  }
  const profile = await loadProfile(data.user.id, data.user.email ?? undefined);
  if (!profile) {
    throw new AuthError("Sua conta ainda não tem um perfil configurado. Fale com o professor.");
  }
  return profile;
}

export async function signOut(): Promise<void> {
  await client().auth.signOut();
}

/** Fires on sign-in, sign-out, and token refresh — including changes from other tabs. */
export function onAuthStateChange(cb: Listener): () => void {
  const { data: sub } = client().auth.onAuthStateChange((_event, session) => {
    if (!session) {
      cb(null);
      return;
    }
    // Se o perfil não carregar (rede oscilando durante a renovação do login), mantém a pessoa como está em vez de deslogá-la.
    loadProfile(session.user.id, session.user.email ?? undefined)
      .then(cb)
      .catch(() => {});
  });
  return () => sub.subscription.unsubscribe();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { data: sessionData } = await client().auth.getSession();
  const email = sessionData.session?.user.email;
  if (!email) throw new AuthError("Sessão expirada. Entre novamente.");

  // Supabase's updateUser() doesn't ask for the current password — re-authenticate first so a
  // wrong "current password" is caught explicitly, matching the UI's error state for that case.
  const { error: reauthError } = await client().auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) {
    // Só "credencial inválida" é senha atual errada (a tela põe o erro no campo dela). Limite de tentativas e falha de conexão
    // são outra coisa: antes TODA falha aqui virava "Senha atual incorreta".
    if (reauthError.status === 429) {
      throw new AuthError("Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.");
    }
    if (reauthError.status === 400 || /invalid login credentials/i.test(reauthError.message)) {
      throw new AuthError("Senha atual incorreta. Confira e tente de novo.", "senha_atual_incorreta");
    }
    throw new AuthError("Não foi possível verificar sua senha atual. Verifique sua conexão e tente de novo.");
  }

  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) {
    throw new AuthError("Não foi possível alterar a senha. Tente novamente.");
  }
}
