import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null); // 'Admin' | 'Staff' | null (while loading)

  const loadRole = async (userId) => {
    if (!userId) {
      setRole(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (error) {
      console.error('Failed to load profile role:', error);
      setRole(null);
      return;
    }
    setRole(data?.role ?? null);
  };

  useEffect(() => {
    // Get any existing session on first load (handles page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadRole(session?.user?.id);
      setLoading(false);
    });

    // Keep session in sync on login/logout/token refresh
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadRole(session?.user?.id);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return result;

    // Auth succeeded, but check whether this account has been disabled
    // (Settings -> User Settings). Do this check BEFORE letting the
    // session stick, so a disabled user never actually gets into the app.
    const userId = result.data.session?.user?.id;
    if (userId) {
      const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', userId).single();
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        return { error: { message: 'This account has been disabled. Contact your Admin.' } };
      }
    }

    return result;
  };

  const logout = () => supabase.auth.signOut();

  const resetPasswordRequest = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword });

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    role,
    isAdmin: role === 'Admin',
    login,
    logout,
    resetPasswordRequest,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
