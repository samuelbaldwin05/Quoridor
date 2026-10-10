// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayPanel } from '../PlayPanel';

/**
 * The panel is the only screen that offers online play, so what it does with a rating it does
 * not have is the whole question. A session whose profile request failed is signed in and has
 * no rating, and the panel used to fill that gap with the 1000 start and let the player queue.
 */

const useAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({ useAuth, AuthProvider: ({ children }: never) => children }));

const refreshProfile = vi.fn();

function authState(over: Record<string, unknown>) {
  return { isGuest: false, profile: null, sessionRecovering: false, refreshProfile, ...over };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <PlayPanel currentDifficulty="bot1" onPlay={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('PlayPanel online availability', () => {
  beforeEach(() => {
    refreshProfile.mockClear();
  });

  it('shows the real rating and offers a match when the profile loaded', () => {
    useAuth.mockReturnValue(authState({ profile: { username: 'sam', elo: 1234 } }));
    renderPanel();

    expect(screen.getByText('1234')).toBeTruthy();
    expect(screen.getByText('Play Online')).toBeTruthy();
  });

  it('locks online behind sign-in for a guest, with no rating shown', () => {
    useAuth.mockReturnValue(authState({ isGuest: true }));
    renderPanel();

    expect(screen.getByText('Sign in to Play Online')).toBeTruthy();
    expect(screen.queryByText('1000')).toBeNull();
  });

  it('locks online and shows no rating when signed in with no profile', () => {
    // The failed-login case: a session in hand, /auth/me never answered. Showing 1000 here
    // told the player a rating that may not be theirs and let them queue on it.
    useAuth.mockReturnValue(authState({ isGuest: false, profile: null }));
    renderPanel();

    expect(screen.getByText('Rating unavailable. Tap to retry')).toBeTruthy();
    expect(screen.queryByText('1000')).toBeNull();
    expect(screen.queryByText('Play Online')).toBeNull();
  });

  it('retries the profile instead of the login page when a signed-in player taps the lock', () => {
    useAuth.mockReturnValue(authState({ isGuest: false, profile: null }));
    renderPanel();

    screen.getByText('Rating unavailable. Tap to retry').click();
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });
});
