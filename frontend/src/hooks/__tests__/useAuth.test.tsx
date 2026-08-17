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
      signInWithOAuth: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { AuthProvider, useAuth } from '@/hooks/useAuth';

const SESSION_HINT_KEY = 'quoridor-had-session';

function fakeSession(isAnonymous = false) {
  return { access_token: 'token', user: { id: 'u1', is_anonymous: isAnonymous } };
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
