import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "super_admin" | "admin" | "vendedor" | "logistica" | "cliente";

export interface ProfileInfo {
  full_name: string | null;
  avatar_url: string | null;
  must_change_password: boolean;
  username: string | null;
  username_provisional: boolean;
  email: string | null;
  email_provisional: boolean;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  profile: ProfileInfo | null;
  loading: boolean;
  /** Acepta username o email como identificador. */
  signIn: (identificador: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  refreshRoles: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Guardado en globalThis para sobrevivir a instancias duplicadas del módulo (HMR).
const KEY = "__westone_auth_context__";
const g = globalThis as unknown as Record<string, unknown>;

export const AuthContext: React.Context<AuthContextValue | undefined> =
  (g[KEY] as React.Context<AuthContextValue | undefined>) ??
  ((g[KEY] = createContext<AuthContextValue | undefined>(undefined)) as React.Context<
    AuthContextValue | undefined
  >);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
