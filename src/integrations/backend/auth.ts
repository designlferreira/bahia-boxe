import { DEMO_PASSWORD, getDb } from "./store";
import type { Profile } from "./types";

const SESSION_KEY = "bahia-boxe-mock-session-v1";

type Listener = (profile: Profile | null) => void;
const listeners = new Set<Listener>();

export class AuthError extends Error {}

function readSessionProfileId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionProfileId(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function notify(profile: Profile | null) {
  listeners.forEach((l) => l(profile));
}

export function getCurrentProfile(): Profile | null {
  const id = readSessionProfileId();
  if (!id) return null;
  return getDb().profiles.find((p) => p.id === id) ?? null;
}

/** Demo credentials: any seeded profile's email + "123456". */
export async function signInWithPassword(email: string, password: string): Promise<Profile> {
  await new Promise((r) => setTimeout(r, 450));
  const profile = getDb().profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
  if (!profile || password !== DEMO_PASSWORD) {
    throw new AuthError("E-mail ou senha incorretos.");
  }
  writeSessionProfileId(profile.id);
  notify(profile);
  return profile;
}

export async function signOut(): Promise<void> {
  writeSessionProfileId(null);
  notify(null);
}

export function onAuthStateChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Used by the invite-acceptance flow to sign the new profile in without a password step. */
export function signInAsProfile(profileId: string) {
  writeSessionProfileId(profileId);
  const profile = getCurrentProfile();
  notify(profile);
  return profile;
}

export async function changePassword(currentPassword: string, _newPassword: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 700));
  if (currentPassword !== DEMO_PASSWORD) {
    throw new AuthError("Senha atual incorreta. Tente novamente.");
  }
  // Mock has a single fixed demo password; a real backend would persist the new hash here.
}
