import { createElement, createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';
import { getDevToken, setDevToken, clearDevToken } from '@/lib/dev';
import { apiFetch } from '@/lib/api';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string; // google name, never overwritten
  username: string | null;
  elo: number;
  games_played: number;
}

type AuthMode = 'none' | 'dev' | 'google';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  isDev: boolean;
  needsUsername: boolean;
  authMode: AuthMode;
  signInWithGoogle: () => Promise<void>;
  signInAsDev: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [isLoading, setIsLoading] = useState(true);

  async function fetchProfile(): Promise<void> {
    try {
      const data = await apiFetch<UserProfile>('/auth/me');
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    if (getDevToken()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthMode('dev');
      fetchProfile().finally(() => setIsLoading(false));
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        setAuthMode('google');
        fetchProfile().finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        setAuthMode('google');
        fetchProfile();
      } else {
        setAuthMode('none');
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInAsDev(): Promise<{ error: string | null }> {
    try {
      setDevToken();
      setAuthMode('dev');
      await fetchProfile();
      return { error: null };
    } catch (err) {
      clearDevToken();
      setAuthMode('none');
      return { error: err instanceof Error ? err.message : 'Dev login failed' };
    }
  }

  async function signOut(): Promise<void> {
    clearDevToken();
    setAuthMode('none');
    setProfile(null);
    setUser(null);
    setSession(null);
    await supabase.auth.signOut();
  }

  async function updateUsername(username: string): Promise<void> {
    const updated = await apiFetch<UserProfile>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ username }),
    });
    setProfile(updated);
  }

  // True if logged in but has never set a username
  const needsUsername = authMode !== 'none' && profile !== null && !profile.username;

  return createElement(AuthContext.Provider, {
    value: {
      user,
      session,
      profile,
      isLoading,
      isGuest: authMode === 'none',
      isDev: config.development.bypassAuth,
      needsUsername,
      authMode,
      signInWithGoogle,
      signInAsDev,
      signOut,
      refreshProfile: fetchProfile,
      updateUsername,
    },
    children,
  });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
