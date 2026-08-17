import { createElement, createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';
import { apiFetch } from '@/lib/api';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  username_chosen: boolean;
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

  // Shorter than the default, because the whole app waits on this one call: UsernameGuard
  // renders a spinner until it settles. Ten seconds of spinner on a cold backend is bad; a
  // spinner that never ends is worse, which is what happened when this had no deadline at all.
  //
  // The cost of giving up early is that `profile` stays null, so a brand-new user skips the
  // /setup redirect for that load and the Elo label shows a placeholder. Both recover on a
  // reload or via refreshProfile, and neither is a blank screen.
  const PROFILE_TIMEOUT_MS = 10000;

  async function fetchProfile(): Promise<void> {
    try {
      const data = await apiFetch<UserProfile>('/auth/me', { timeoutMs: PROFILE_TIMEOUT_MS });
      setProfile(data);
    } catch (err) {
      // Worth a line in the console: from the UI alone, "signed in with no profile" looks the
      // same whether the backend is down, cold, or rejecting the token.
      console.warn('Could not load profile:', err);
      setProfile(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // onAuthStateChange fires INITIAL_SESSION synchronously before this promise
      // resolves, so auth state + profile fetch are already handled there.
      // Only the no-session path needs explicit isLoading cleanup here.
      if (!session) setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        // An anonymous session is the dev login (see signInAsDev), not a Google one.
        setAuthMode(session.user.is_anonymous ? 'dev' : 'google');
        // Wait for profile before clearing isLoading — otherwise the guard and
        // ELO label briefly see (isLoading=false, profile=null) and show stale
        // defaults or let new users through to the app before /setup redirect.
        fetchProfile().finally(() => setIsLoading(false));
      } else {
        setAuthMode('none');
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  /**
   * Local development login. It signs in ANONYMOUSLY, which means a real Supabase session
   * rather than the hand-rolled "dev-token" this used to set. Two reasons that matters:
   *
   * - Online play needs a genuine session. The per-game Realtime channel is private
   *   (migration 024), and its policies are `TO authenticated`, so a client without a
   *   Supabase session gets no realtime at all: no moves, no presence, no error.
   * - Every anonymous sign-in is a distinct user, where the old dev token was one shared
   *   id for everybody. Two dev logins could therefore never be matched against each
   *   other (matchmaking will not pair a user with themselves); now they can, which is
   *   what makes a local two-client test possible at all.
   *
   * Needs `enable_anonymous_sign_ins` on the Supabase project. It is on locally (see
   * supabase/config.toml) and off in the hosted one, where the button is not shown either.
   */
  async function signInAsDev(): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setAuthMode('none');
      return { error: error.message };
    }
    // onAuthStateChange picks the session up and loads the profile.
    return { error: null };
  }

  async function signOut(): Promise<void> {
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
  // username is always set on the row (placeholder on insert), so the trigger
  // for the setup page is the explicit username_chosen flag, not nullness.
  const needsUsername = authMode !== 'none' && profile !== null && !profile.username_chosen;

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
