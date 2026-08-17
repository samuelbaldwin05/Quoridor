import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
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

/**
 * Marker that this browser has held a session, so "no session" can be told apart from
 * "could not get at the session". Written whenever one is seen, removed only when the user
 * is genuinely signed out (they asked to be, or the refresh token was rejected).
 *
 * Why it is needed: an access token lasts an hour, so opening the app later always needs a
 * refresh first, and supabase-js reports a FAILED refresh as `INITIAL_SESSION` with a null
 * session. Without this marker that is indistinguishable from being logged out, which is
 * how a phone opening the home-screen app on a waking radio ended up quietly browsing as a
 * guest with a perfectly good refresh token still in storage.
 */
const SESSION_HINT_KEY = 'quoridor-had-session';

function rememberHadSession(): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } catch {
    // Private mode or a storage-less browser. Recovery is then best-effort, which is the
    // same position we were in before.
  }
}

function forgetHadSession(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // ignore
  }
}

function hadSession(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether a failed refresh means "signed out" or "try again later". A 4xx is the auth
 * server rejecting the refresh token, which is final: it expired, or rotation invalidated
 * it because another tab used it first. Anything else (offline, a 5xx, a timeout) is the
 * network, and the session is still good once it comes back.
 */
function isFinalAuthFailure(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

// Recovery attempts after a failed restore, on top of the retries triggered by coming back
// online or returning to the tab. Short, because the app is sitting there looking signed
// out while this runs.
const RECOVERY_DELAYS_MS = [1500, 5000, 15000];

// Backstop for the initial resolve. INITIAL_SESSION is emitted on subscribe, so this
// should never fire; it exists because the alternative to a late event is a spinner that
// never ends, which is the bug AppLoading was introduced for.
const AUTH_RESOLVE_TIMEOUT_MS = 12000;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  /** Signed out only because the session could not be restored yet, and being retried. */
  sessionRecovering: boolean;
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
  // Signed out only because the session could not be restored, and worth retrying. The UI
  // says "reconnecting" rather than offering to sign in, which would be a lie.
  const [sessionRecovering, setSessionRecovering] = useState(false);

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

  const adoptSession = useCallback((next: Session) => {
    rememberHadSession();
    recoveringRef.current = false;
    setSessionRecovering(false);
    recoveryAttempt.current = 0;
    setSession(next);
    setUser(next.user);
    // An anonymous session is the dev login (see signInAsDev), not a Google one.
    setAuthMode(next.user.is_anonymous ? 'dev' : 'google');
    // Wait for profile before clearing isLoading — otherwise the guard and ELO label
    // briefly see (isLoading=false, profile=null) and show stale defaults or let new users
    // through to the app before the /setup redirect.
    fetchProfile().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry a restore that failed on the network. Each attempt goes through the auth client,
  // so a success arrives as a normal auth event and is handled in one place below.
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryAttempt = useRef(0);
  // Mirrors sessionRecovering for the listeners below, which are registered once and must
  // not close over a stale value. Only a restore that FAILED may refresh: doing it on every
  // tab focus would spend a refresh token each time, and with rotation on that is how you
  // invalidate the one another tab is about to use.
  const recoveringRef = useRef(false);

  /**
   * Last chance before declaring someone signed out: read storage again.
   *
   * Rotation makes a refresh token single-use, so when an installed app and a browser tab
   * restore seconds apart, the slower one is refusing a token the faster one already
   * rotated. Its own refresh is genuinely dead, but the session the other context wrote is
   * sitting right there and is perfectly good.
   */
  const adoptSessionFromStorage = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    adoptSession(data.session);
    return true;
  }, [adoptSession]);

  const recoverSession = useCallback(async () => {
    if (!recoveringRef.current || !hadSession()) return;
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) return; // the auth listener takes it from here
    if (error && isFinalAuthFailure(error.status)) {
      // The auth server refused the token. Before calling it a sign-out, check whether
      // another context on this device won a rotation race and left a good session behind.
      if (await adoptSessionFromStorage()) return;
      forgetHadSession();
      recoveringRef.current = false;
      setSessionRecovering(false);
      return;
    }
    const delay = RECOVERY_DELAYS_MS[recoveryAttempt.current];
    if (delay === undefined) return; // out of attempts; online/visible still retry
    recoveryAttempt.current += 1;
    if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
    recoveryTimer.current = setTimeout(() => void recoverSession(), delay);
  }, [adoptSessionFromStorage]);

  useEffect(() => {
    // Backstop only: clears the spinner if the first auth event never arrives.
    const resolveTimer = setTimeout(() => setIsLoading(false), AUTH_RESOLVE_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session) {
        adoptSession(session);
        return;
      }

      setSession(null);
      setUser(null);

      // No session. The event says which kind of no: SIGNED_OUT is the user leaving,
      // while INITIAL_SESSION with nothing in hand can also be a refresh that failed on
      // the way in, and treating that as signed out is what made a phone open the app as
      // a guest. The marker tells the two apart.
      setAuthMode('none');
      setProfile(null);
      setIsLoading(false);

      if (event === 'SIGNED_OUT') {
        forgetHadSession();
        recoveringRef.current = false;
        setSessionRecovering(false);
        return;
      }
      if (hadSession()) {
        recoveringRef.current = true;
        setSessionRecovering(true);
        void recoverSession();
      }
    });

    // A launch that beat the network, or a phone that has been in someone's pocket: both
    // end with an event worth retrying on.
    const retry = () => {
      if (document.hidden || !recoveringRef.current) return;
      recoveryAttempt.current = 0;
      void recoverSession();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);

    // Another context on this device writing a session: the installed app and a browser
    // tab share an origin, so a token one of them refreshes lands in storage the other can
    // read. Adopt it, which is what turns a lost rotation race into a shrug.
    //
    // Adopting only, never signing out: a storage clear can be the loser of that same race
    // wiping the key on its way down, and following it would take a working session with
    // it. If ours has genuinely gone stale, its next refresh gets a 4xx and that path
    // handles it.
    const onStorage = (e: StorageEvent) => {
      const isAuthKey = e.key?.startsWith('sb-') && e.key.endsWith('-auth-token');
      if (!isAuthKey || !e.newValue) return;
      void adoptSessionFromStorage();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      clearTimeout(resolveTimer);
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
      window.removeEventListener('storage', onStorage);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    forgetHadSession();
    recoveringRef.current = false;
    setSessionRecovering(false);
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
      sessionRecovering,
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
