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
