import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentProfile, onAuthStateChange, signInWithPassword, signOut as apiSignOut } from "@/integrations/backend/auth";
import type { Profile } from "@/integrations/backend/types";

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfile(getCurrentProfile());
    setLoading(false);
    return onAuthStateChange(setProfile);
  }, []);

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
    refreshProfile: () => setProfile(getCurrentProfile()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
