import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentProfile, onAuthStateChange, signInWithPassword, signOut as apiSignOut } from "@/integrations/backend/auth";
import { acceptInvite } from "@/integrations/backend/api";
import { lerConvitePendente, limparConvitePendente } from "@/lib/convitePendente";
import type { Profile } from "@/integrations/backend/types";

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => void;
}

// Exportado só pra página de amostras de desenvolvimento (`src/dev/Amostras.tsx`) injetar um
// perfil falso sem passar pelo login. O app de verdade sempre usa `AuthProvider`.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCurrentProfile()
      .then((p) => {
        if (active) setProfile(p);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = onAuthStateChange((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Convite guardado porque a conta foi criada sem sessão (confirmação de e-mail): assim que existe um
  // usuário logado — pelo link do e-mail ou por um login normal —, conclui o convite. Limpa o token
  // de qualquer jeito, pra um convite já usado/expirado não tentar de novo a cada abertura.
  useEffect(() => {
    if (!profile) return;
    const token = lerConvitePendente();
    if (!token) return;
    limparConvitePendente();
    acceptInvite(token)
      .then(() => getCurrentProfile().then(setProfile))
      .catch(() => {
        /* convite já usado ou expirado: o aluno segue como está */
      });
  }, [profile]);

  const value: AuthContextValue = {
    profile,
    loading,
    signIn: async (email, password) => {
      const p = await signInWithPassword(email, password);
      setProfile(p);
      return p;
    },
    signOut: async () => {
      await apiSignOut();
      setProfile(null);
    },
    refreshProfile: () => {
      getCurrentProfile().then(setProfile);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
