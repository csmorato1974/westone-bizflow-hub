import { useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type AppRole, type ProfileInfo } from "@/contexts/auth-core";

export { useAuth, AuthContext } from "@/contexts/auth-core";
export type { AppRole, AuthContextValue, ProfileInfo } from "@/contexts/auth-core";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, must_change_password, username, username_provisional, email, email_provisional")
      .eq("id", userId)
      .maybeSingle();
    setProfile(
      data
        ? {
            full_name: data.full_name,
            avatar_url: data.avatar_url,
            must_change_password: !!data.must_change_password,
            username: data.username ?? null,
            username_provisional: !!data.username_provisional,
            email: data.email ?? null,
            email_provisional: !!data.email_provisional,
          }
        : null,
    );
  };

  /** El email de la cuenta es la fuente de verdad: sincroniza profiles.email si cambió. */
  const syncEmail = async () => {
    await supabase.rpc("sincronizar_mi_email");
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          loadRoles(newSession.user.id);
          loadProfile(newSession.user.id);
        }, 0);
      } else {
        setRoles([]);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        Promise.all([loadRoles(s.user.id), loadProfile(s.user.id)]).finally(() =>
          setLoading(false),
        );
      } else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        updatePassword,
        hasRole,
        isAdmin,
        refreshRoles,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
