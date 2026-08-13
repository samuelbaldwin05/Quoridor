// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// The hook backfills bot-game history via the sync module and reads auth state —
// mock both at the module boundary so the session flow can be driven in jsdom.
vi.mock('@/lib/botGameSync', () => ({ syncPendingBotGames: vi.fn(async () => {}) }));
vi.mock('../useAuth', () => ({ useAuth: vi.fn() }));

import { syncPendingBotGames } from '@/lib/botGameSync';
import { useAuth } from '../useAuth';
import { useBotGameSync } from '@/hooks/useBotGameSync';

type AuthMode = 'none' | 'dev' | 'google';

// useBotGameSync only reads authMode + isLoading; stub the rest of the context.
function setAuth(authMode: AuthMode, isLoading = false): void {
  vi.mocked(useAuth).mockReturnValue({ authMode, isLoading } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBotGameSync', () => {
  it('does nothing while auth is still loading', () => {
    setAuth('dev', true);
    renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).not.toHaveBeenCalled();
  });

  it('does not sync when signed out (authMode none)', () => {
    setAuth('none');
    renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).not.toHaveBeenCalled();
  });

  it('syncs once when signed in via dev', () => {
    setAuth('dev');
    renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);
  });

  it('syncs once when signed in via google', () => {
    setAuth('google');
    renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);
  });

  it('does not sync again on re-render while still signed in (didSync guard)', () => {
    setAuth('google');
    const { rerender } = renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);

    rerender();
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);
  });

  it('re-arms on sign-out: syncs again after none then back to signed in', () => {
    setAuth('google');
    const { rerender } = renderHook(() => useBotGameSync());
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);

    setAuth('none');
    rerender();
    expect(syncPendingBotGames).toHaveBeenCalledTimes(1);

    setAuth('google');
    rerender();
    expect(syncPendingBotGames).toHaveBeenCalledTimes(2);
  });
});
