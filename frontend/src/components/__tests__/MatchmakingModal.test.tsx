// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { MatchmakingModal } from '../MatchmakingModal';

const FIVE_MINUTES = 5 * 60 * 1000;
const HIDDEN_GRACE = 60 * 1000;

// The cap lives in the backend, so the fake one has to behave like it: report the time
// left on join, and count it down on every poll.
const CAP_SECONDS = 300;
let joinedAt = 0;
let statusOverride: Record<string, unknown> | null = null;

function renderModal(overrides: Partial<Parameters<typeof MatchmakingModal>[0]> = {}) {
  return render(
    <MatchmakingModal
      timeControl={300}
      displayName="me"
      elo={1000}
      onMatchFound={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

/** Render, then let the join request settle so the modal is in its searching state. */
async function renderSearching(overrides = {}) {
  const utils = renderModal(overrides);
  await act(async () => {});
  expect(screen.getByText(/Searching/)).toBeInTheDocument();
  return utils;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function leaveCalls() {
  return vi.mocked(apiFetch).mock.calls.filter(([path]) => path === '/matchmaking/leave');
}

beforeEach(() => {
  vi.useFakeTimers();
  statusOverride = null;
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/matchmaking/join') {
      joinedAt = Date.now();
      return { status: 'waiting', expires_in_seconds: CAP_SECONDS };
    }
    if (path === '/matchmaking/status') {
      if (statusOverride) return statusOverride;
      const elapsed = Math.floor((Date.now() - joinedAt) / 1000);
      return { status: 'waiting', expires_in_seconds: Math.max(0, CAP_SECONDS - elapsed) };
    }
    return {};
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  setHidden(false);
});

describe('MatchmakingModal search cap', () => {
  it('gives up after five minutes and leaves the queue', async () => {
    await renderSearching();

    await act(async () => {
      vi.advanceTimersByTime(FIVE_MINUTES + 2000);
    });

    expect(screen.getByText('Nobody around right now')).toBeInTheDocument();
    expect(screen.getByText(/The 5 min pool is quiet/)).toBeInTheDocument();
    expect(leaveCalls()).toHaveLength(1);
  });

  it('keeps searching just short of the cap', async () => {
    await renderSearching();

    await act(async () => {
      vi.advanceTimersByTime(FIVE_MINUTES - 5000);
    });

    expect(screen.getByText(/Searching/)).toBeInTheDocument();
    expect(leaveCalls()).toHaveLength(0);
  });

  it('shows the same message when the server expires the row first', async () => {
    await renderSearching();
    statusOverride = { status: 'expired' };

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Nobody around right now')).toBeInTheDocument();
  });

  it('offers a bot game only when the parent supplies one', async () => {
    const onPlayBot = vi.fn();
    await renderSearching({ onPlayBot });

    await act(async () => {
      vi.advanceTimersByTime(FIVE_MINUTES + 2000);
    });

    screen.getByText('Play a bot').click();
    expect(onPlayBot).toHaveBeenCalledTimes(1);
  });

  it('searches again from the expired state, resetting the cap', async () => {
    await renderSearching();
    await act(async () => {
      vi.advanceTimersByTime(FIVE_MINUTES + 2000);
    });

    await act(async () => {
      screen.getByText('Search again').click();
    });
    expect(screen.getByText(/Searching/)).toBeInTheDocument();

    // The clock restarted: most of another five minutes must pass before it gives up.
    await act(async () => {
      vi.advanceTimersByTime(FIVE_MINUTES - 5000);
    });
    expect(screen.getByText(/Searching/)).toBeInTheDocument();
  });
});

describe('MatchmakingModal tab handling', () => {
  it('pauses the search after a sustained absence', async () => {
    await renderSearching();

    act(() => setHidden(true));
    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_GRACE);
    });

    expect(screen.getByText('Search paused')).toBeInTheDocument();
    expect(screen.getByText('You stepped away, so we stopped looking.')).toBeInTheDocument();
    expect(leaveCalls()).toHaveLength(1);
  });

  it('keeps the place for a quick glance at another tab', async () => {
    await renderSearching();

    act(() => setHidden(true));
    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_GRACE - 5000);
    });
    act(() => setHidden(false));
    await act(async () => {
      vi.advanceTimersByTime(HIDDEN_GRACE);
    });

    expect(screen.getByText(/Searching/)).toBeInTheDocument();
    expect(leaveCalls()).toHaveLength(0);
  });

  it('leaves the queue on the way out of the page', async () => {
    await renderSearching();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(leaveCalls()).toHaveLength(1);
    expect(leaveCalls()[0]![1]).toMatchObject({ method: 'DELETE', keepalive: true });
  });
});
