// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// The auth client is the thing under test's whole world: a fake one lets the events a real
// session restore produces be fired by hand, including the awkward one.
const listeners: ((event: string, session: unknown) => void)[] = [];
const refreshSession = vi.hoisted(() =>
  vi.fn(async () => ({ data: { session: null }, error: null }) as unknown),
);
const getSession = vi.hoisted(() =>
  vi.fn(async () => ({ data: { session: null }, error: null }) as unknown),
);
const signInAnonymously = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      refreshSession,
      getSession,
      signInAnonymously,
      signOut,
      signInWithIdToken: vi.fn(),
    },
  },
}));
const apiFetch = vi.hoisted(() => vi.fn(async () => ({}) as unknown));
vi.mock('@/lib/api', () => ({ apiFetch }));

import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { resetBootSplashForTests } from '@/lib/bootSplash';

const SESSION_HINT_KEY = 'quoridor-had-session';
const STORED_SESSION_KEY = 'sb-abcdefgh-auth-token';

/** What supabase-js leaves in localStorage for a session it is holding. */
function storeSupabaseSession() {
  localStorage.setItem(STORED_SESSION_KEY, JSON.stringify({ refresh_token: 'r1' }));
}

function fakeSession(isAnonymous = false, loginKind?: 'guest' | 'dev') {
  return {
    access_token: 'token',
    user: {
      id: 'u1',
      is_anonymous: isAnonymous,
      user_metadata: loginKind ? { login_kind: loginKind } : {},
    },
  };
}

function Probe() {
  const { isGuest, sessionRecovering, authMode } = useAuth();
  return (
    <span data-testid="state">{`${authMode}|guest=${isGuest}|recovering=${sessionRecovering}`}</span>
  );
}

function renderProvider() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

function emit(event: string, session: unknown) {
  return act(async () => {
    for (const cb of listeners) cb(event, session);
  });
}

function state() {
  return screen.getByTestId('state').textContent;
}

beforeEach(() => {
  listeners.length = 0;
  localStorage.clear();
  vi.clearAllMocks();
  refreshSession.mockResolvedValue({ data: { session: null }, error: null } as unknown);
  getSession.mockResolvedValue({ data: { session: null }, error: null } as unknown);
  apiFetch.mockResolvedValue({} as unknown);
  resetBootSplashForTests();
  document.body.innerHTML = '<div id="boot-splash"></div><div id="app-root"></div>';
});

afterEach(() => {
  localStorage.clear();
});

describe('AuthProvider session restore', () => {
  it('treats a first visit with no session as a guest', async () => {
    renderProvider();
    await emit('INITIAL_SESSION', null);
    expect(state()).toBe('none|guest=true|recovering=false');
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('remembers a session, so a later failed restore is not mistaken for a sign-out', async () => {
    renderProvider();
    await emit('INITIAL_SESSION', fakeSession());
    expect(state()).toBe('google|guest=false|recovering=false');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('retries instead of dropping to a plain guest when the restore failed', async () => {
    // This is the reported bug: an access token lasts an hour, so opening the app later
    // always refreshes first, and supabase-js reports a FAILED refresh as INITIAL_SESSION
    // with a null session. Read as a sign-out, it browsed as a guest with a good refresh
    // token still in storage.
    localStorage.setItem(SESSION_HINT_KEY, '1');
    renderProvider();
    await emit('INITIAL_SESSION', null);

    expect(state()).toBe('none|guest=true|recovering=true');
    expect(refreshSession).toHaveBeenCalled();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('comes back signed in when a retry lands', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    renderProvider();
    await emit('INITIAL_SESSION', null);
    expect(state()).toBe('none|guest=true|recovering=true');

    // A real refresh arrives as an auth event, exactly like any other sign-in.
    await emit('TOKEN_REFRESHED', fakeSession());
    expect(state()).toBe('google|guest=false|recovering=false');
  });

  it('stops claiming a session when the refresh token is rejected', async () => {
    // 4xx is the auth server refusing the token: expired, or rotated out from under us by
    // another tab. That is a real sign-out and should not be retried forever.
    localStorage.setItem(SESSION_HINT_KEY, '1');
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: 'refresh_token_not_found' },
    } as unknown);
    renderProvider();
    await emit('INITIAL_SESSION', null);

    expect(state()).toBe('none|guest=true|recovering=false');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('forgets the session on a real sign-out', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    renderProvider();
    await emit('SIGNED_OUT', null);

    expect(state()).toBe('none|guest=true|recovering=false');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('reads an anonymous session as the dev login', async () => {
    renderProvider();
    await emit('INITIAL_SESSION', fakeSession(true));
    expect(state()).toBe('dev|guest=false|recovering=false');
  });
});

describe('AuthProvider recovery retries', () => {
  it('does not spend a refresh token on tab focus while nothing is wrong', async () => {
    // Refreshing on every visibility change is not free: with rotation on, it invalidates
    // the token another tab is about to use.
    renderProvider();
    await emit('INITIAL_SESSION', fakeSession());

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('retries on coming back online while a restore is outstanding', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    renderProvider();
    await emit('INITIAL_SESSION', null);
    const afterRestore = refreshSession.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(refreshSession.mock.calls.length).toBeGreaterThan(afterRestore);
  });
});

describe('AuthProvider across two contexts on one device', () => {
  it('adopts a session another context wrote instead of signing out on a lost race', async () => {
    // Rotation makes a refresh token single-use, so the slower of two contexts restoring
    // seconds apart gets a 4xx for a token the faster one already rotated. Its own refresh
    // is dead, but the session the other one wrote is right there in storage.
    localStorage.setItem(SESSION_HINT_KEY, '1');
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: 'refresh_token_not_found' },
    } as unknown);
    getSession.mockResolvedValue({ data: { session: fakeSession() }, error: null } as unknown);

    renderProvider();
    await emit('INITIAL_SESSION', null);

    expect(state()).toBe('google|guest=false|recovering=false');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('picks up a session that appears in storage while sitting there signed out', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    renderProvider();
    await emit('INITIAL_SESSION', null);
    expect(state()).toBe('none|guest=true|recovering=true');

    getSession.mockResolvedValue({ data: { session: fakeSession() }, error: null } as unknown);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'sb-abcdef-auth-token', newValue: '{"x":1}' }),
      );
    });

    expect(state()).toBe('google|guest=false|recovering=false');
  });

  it('does not follow another context clearing the key', async () => {
    // That clear can be the loser of a rotation race wiping the key on its way down, and
    // following it would throw away a session that still works.
    renderProvider();
    await emit('INITIAL_SESSION', fakeSession());
    expect(state()).toBe('google|guest=false|recovering=false');

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'sb-abcdef-auth-token', newValue: null }),
      );
    });

    expect(state()).toBe('google|guest=false|recovering=false');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('ignores storage events for keys that are not the session', async () => {
    renderProvider();
    await emit('INITIAL_SESSION', null);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'quoridor_games', newValue: '[]' }));
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe('signInWithGoogle', () => {
  it('sends the browser to our own backend rather than to the Supabase project', async () => {
    // The point of the whole handshake: Google's consent screen names the host of the
    // redirect URI, so it has to be ours.
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'https://app.test', assign });
    sessionStorage.clear();

    function GoogleButton() {
      const { signInWithGoogle } = useAuth();
      return <button onClick={() => void signInWithGoogle()}>sign in</button>;
    }
    render(
      <AuthProvider>
        <GoogleButton />
      </AuthProvider>,
    );
    await emit('INITIAL_SESSION', null);
    await act(async () => {
      screen.getByText('sign in').click();
    });

    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/auth/google/start');
    expect(url.searchParams.get('origin')).toBe('https://app.test');
    expect(url.searchParams.get('handoff')).toBeTruthy();

    vi.unstubAllGlobals();
  });
});

function LoadingProbe() {
  const { isLoading, authMode, sessionRecovering } = useAuth();
  return (
    <span data-testid="loading">{`loading=${isLoading}|${authMode}|recovering=${sessionRecovering}`}</span>
  );
}

function renderLoadingProbe() {
  render(
    <AuthProvider>
      <LoadingProbe />
    </AuthProvider>,
  );
  return () => screen.getByTestId('loading').textContent;
}

describe('AuthProvider first paint', () => {
  it('does not claim to be signing anyone in when storage holds no session', () => {
    // The reported bug: every cold load sat on the loading screen before deciding, for
    // browsers that were never signed in and browsers that were, alike.
    const state = renderLoadingProbe();
    expect(state()).toBe('loading=false|none|recovering=false');
  });

  it('waits when supabase-js has a session in storage', () => {
    storeSupabaseSession();
    const state = renderLoadingProbe();
    expect(state()).toBe('loading=true|none|recovering=false');
  });

  it('ignores keys that only look like a stored session', () => {
    // The PKCE verifier and the split-out user object share the prefix and are not sessions.
    localStorage.setItem('sb-abcdefgh-auth-token-code-verifier', 'v');
    localStorage.setItem('sb-abcdefgh-auth-token-user', '{}');
    const state = renderLoadingProbe();
    expect(state()).toBe('loading=false|none|recovering=false');
  });

  it('trusts storage over the hint marker when deciding to chase a session', async () => {
    // No marker (a browser that has never completed a restore here), but supabase-js is
    // holding a session. Calling that a guest is how a signed-in player browses anonymously.
    storeSupabaseSession();
    const state = renderLoadingProbe();
    await emit('INITIAL_SESSION', null);

    expect(state()).toBe('loading=false|none|recovering=true');
    expect(refreshSession).toHaveBeenCalled();
  });

  it('lets the app through when the profile request hangs on a cold backend', async () => {
    vi.useFakeTimers();
    apiFetch.mockImplementation(() => new Promise(() => {}));
    storeSupabaseSession();
    const state = renderLoadingProbe();
    await emit('INITIAL_SESSION', fakeSession());
    expect(state()).toBe('loading=true|google|recovering=false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(state()).toBe('loading=false|google|recovering=false');
    vi.useRealTimers();
  });
});

describe('AuthProvider recovery does not give up', () => {
  it('keeps retrying past the end of the backoff list', async () => {
    // It used to stop after the last delay while still reporting "Reconnecting", which is a
    // promise nothing was left to keep.
    vi.useFakeTimers();
    storeSupabaseSession();
    renderLoadingProbe();
    await emit('INITIAL_SESSION', null);

    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
    }
    expect(refreshSession.mock.calls.length).toBeGreaterThan(4);
    vi.useRealTimers();
  });
});

describe('the boot splash', () => {
  const splash = () => document.getElementById('boot-splash');

  it('goes away immediately for a browser with no session to restore', () => {
    renderLoadingProbe();
    expect(splash()!.dataset.done).toBe('true');
  });

  it('stays up while a session is being restored, and carries no caption', async () => {
    // The board animating is the whole message. A line of text over it read as a second
    // loading screen competing with the first.
    storeSupabaseSession();
    renderLoadingProbe();
    expect(splash()!.dataset.done).toBeUndefined();
    expect(splash()!.textContent).toBe('');

    await emit('INITIAL_SESSION', fakeSession());
    expect(splash()!.dataset.done).toBe('true');
  });

  it('gets out of the way when a restore fails, rather than sitting on a dead promise', async () => {
    storeSupabaseSession();
    renderLoadingProbe();
    await emit('INITIAL_SESSION', null);
    // The app is released here and the login page carries the reconnecting message from now
    // on, so the splash has no business staying up.
    expect(splash()!.dataset.done).toBe('true');
  });
});

describe('guest sessions', () => {
  function GuestProbe() {
    const { ensureGuestSession, authMode, isGuest, needsUsername } = useAuth();
    return (
      <button data-testid="play" onClick={() => void ensureGuestSession()}>
        {`${authMode}|guest=${isGuest}|setup=${needsUsername}`}
      </button>
    );
  }

  function renderGuestProbe() {
    render(
      <AuthProvider>
        <GuestProbe />
      </AuthProvider>,
    );
  }

  const probe = () => screen.getByTestId('play');

  async function play() {
    await act(async () => {
      probe().click();
    });
  }

  it('signs a playing guest in anonymously, tagged as a guest', async () => {
    renderGuestProbe();
    await emit('INITIAL_SESSION', null);
    await play();

    expect(signInAnonymously).toHaveBeenCalledWith({ options: { data: { login_kind: 'guest' } } });
  });

  it('leaves an existing session alone', async () => {
    // Someone signed in who opens a local game: their own session already covers the
    // recording, and a second anonymous one would split their history in two.
    getSession.mockResolvedValue({ data: { session: fakeSession() }, error: null } as unknown);
    renderGuestProbe();
    await emit('INITIAL_SESSION', fakeSession());
    await play();

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates one guest, however many times it is asked', async () => {
    // Every move of a game can ask, and each sign-in would otherwise be another user row.
    renderGuestProbe();
    await emit('INITIAL_SESSION', null);
    await play();
    await play();
    await play();

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('still lets the game be played when anonymous sign-ins are switched off', async () => {
    // A project setting, not something the player did. The local save is untouched and
    // uploads at their next real login.
    signInAnonymously.mockResolvedValueOnce({ error: { message: 'disabled' } } as never);
    renderGuestProbe();
    await emit('INITIAL_SESSION', null);
    await play();

    expect(probe().textContent).toBe('none|guest=true|setup=false');
  });

  it('counts a tagged anonymous session as a guest, not as the dev login', async () => {
    renderGuestProbe();
    await emit('INITIAL_SESSION', fakeSession(true, 'guest'));

    expect(probe().textContent).toBe('guest|guest=true|setup=false');
  });

  it('still reads an untagged anonymous session as the dev login', async () => {
    // Sessions created before the tag existed were all dev logins, and a dev login has to
    // keep reaching online play for the two-client test to be possible. It also still picks
    // a username, since it plays ranked games; only the guest mode skips /setup.
    renderGuestProbe();
    await emit('INITIAL_SESSION', fakeSession(true));

    expect(probe().textContent).toBe('dev|guest=false|setup=true');
  });

  it('does not send a guest to pick a username', async () => {
    // The backend makes a profile row for any session, guest included, with
    // username_chosen false. Routing on that alone would ask someone who has not signed in
    // for a public identity.
    apiFetch.mockResolvedValue({
      id: 'u1',
      username: 'player_u1',
      username_chosen: false,
      elo: 1000,
    } as unknown);
    renderGuestProbe();
    await emit('INITIAL_SESSION', fakeSession(true, 'guest'));

    expect(probe().textContent).toBe('guest|guest=true|setup=false');
  });
});
