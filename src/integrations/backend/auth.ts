import { supabase } from "@/integrations/supabase/client";
import type { Profile, Role } from "./types";

export class AuthError extends Error {}

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
  if (error || !data) return null;
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

export type SignUpResult =
  | { status: "signed_in"; profile: Profile }
  // Email confirmation is on for this project: the account exists but has no session yet.
  | { status: "needs_confirmation"; email: string }
  // Account created, but no profile row came back (the DB trigger that provisions it may be
  // missing or may not cover this role). Reported rather than silently half-working.
  | { status: "profile_missing"; email: string };

export async function signUpWithPassword(name: string, email: string, password: string): Promise<SignUpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client().auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { name: name.trim() } },
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

export async function signInWithPassword(email: string, password: string): Promise<Profile> {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    // Only an actual credential rejection should be reported as one. A dropped connection
    // (no status) or a server/gateway problem (403/5xx) would otherwise tell users their
    // password is wrong when it isn't.
    const status = error?.status;
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
    loadProfile(session.user.id, session.user.email ?? undefined).then(cb);
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
    throw new AuthError("Senha atual incorreta. Tente novamente.");
  }

  const { error } = await client().auth.updateUser({ password: newPassword });
  if (error) {
    throw new AuthError("Não foi possível alterar a senha. Tente novamente.");
  }
}
