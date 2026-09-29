import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getCurrentProfile,
  lerConviteDaConta,
  limparConviteDaConta,
  onAuthStateChange,
  signInWithPassword,
  signOut as apiSignOut,
} from "@/integrations/backend/auth";
import { toast } from "sonner";
import { acceptInvite } from "@/integrations/backend/api";
import { lerConvitePendente, limparConvitePendente } from "@/lib/convitePendente";
import type { Profile } from "@/integrations/backend/types";

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => void;
  /** A sessão existe mas o perfil não carregou (sem rede, servidor fora): as rotas mostram "tentar de novo" em vez de mandar para o login. */
  loadError?: boolean;
  retry?: () => void;
}

// Exportado só pra página de amostras de desenvolvimento (`src/dev/Amostras.tsx`) injetar um
// perfil falso sem passar pelo login. O app de verdade sempre usa `AuthProvider`.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // Para distinguir "a sessão terminou sozinha" (vencida/revogada/outra aba) de "a pessoa tocou em Sair".
  const profileRef = useRef<Profile | null>(null);
  const saidaManual = useRef(false);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCurrentProfile()
      .then((p) => {
        if (!active) return;
        setLoadError(false);
        setProfile(p);
      })
      .catch(() => {
        // Sessão existe mas o perfil não veio (sem rede, servidor fora): NÃO é "deslogado". Sem isto, abrir o app sem rede caía no login.
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = onAuthStateChange((p) => {
      if (!active) return;
      if (!p && profileRef.current && !saidaManual.current) {
        toast("Sua sessão terminou. Entre de novo para continuar.", { id: "sessao-terminou" });
      }
      if (p) setLoadError(false);
      setProfile(p);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [tentativa]);

  // Convite guardado porque a conta foi criada sem sessão (confirmação de e-mail): assim que existe um
  // usuário logado — pelo link do e-mail ou por um login normal —, conclui o convite. Limpa o token
  // de qualquer jeito, pra um convite já usado/expirado não tentar de novo a cada abertura.
  // O convite vem de dois lugares: o aparelho onde o aluno abriu o link (`localStorage`) e a PRÓPRIA CONTA (metadados,
  // gravado no cadastro) — este cobre o link do e-mail aberto em outro navegador/aparelho, onde o `localStorage` está vazio.
  const conviteEmAndamento = useRef(false);
  useEffect(() => {
    if (!profile || conviteEmAndamento.current) return;
    conviteEmAndamento.current = true;
    (async () => {
      try {
        const doAparelho = lerConvitePendente();
        const token = doAparelho ?? (await lerConviteDaConta());
        if (!token) return;
        limparConvitePendente();
        try {
          await acceptInvite(token);
          setProfile(await getCurrentProfile());
        } catch {
          /* convite já usado ou expirado: o aluno segue como está */
        } finally {
          await limparConviteDaConta().catch(() => {});
        }
      } finally {
        conviteEmAndamento.current = false;
      }
    })();
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
      saidaManual.current = true;
      try {
        await apiSignOut();
        setProfile(null);
        setLoadError(false);
      } finally {
        saidaManual.current = false;
      }
    },
    loadError,
    retry: () => setTentativa((n) => n + 1),
    refreshProfile: () => {
      getCurrentProfile()
        .then(setProfile)
        .catch(() => {});
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
