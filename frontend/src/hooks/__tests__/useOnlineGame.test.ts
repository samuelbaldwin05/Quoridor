// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Move } from '@/engine/gameTypes';

// The hook talks to Supabase Realtime and the REST API — mock both at the module
// boundary so the socket/turn flow can be driven deterministically in jsdom.
vi.mock('@/lib/supabase', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(async () => ({})),
}));

import { supabase } from '@/lib/supabase';
import { ApiHttpError, apiFetch } from '@/lib/api';
import { useOnlineGame } from '@/hooks/useOnlineGame';

type BroadcastArg = { payload: { move?: Move; playerIndex?: number } };
type Presence = Record<string, { userId: string }[]>;

// A stand-in for a Supabase RealtimeChannel: records the handlers the hook
// registers via the fluent .on(...).subscribe(...) chain so tests can fire them.
function makeFakeChannel() {
  const handlers: Record<string, (arg: BroadcastArg) => void> = {};
  let subscribeCb: ((status: string) => void | Promise<void>) | null = null;
  let presence: Presence = {};

  const channel = {
    on(_type: string, filter: { event: string }, handler: (arg: BroadcastArg) => void) {
      handlers[filter.event] = handler;
      return channel;
    },
    subscribe(cb: (status: string) => void | Promise<void>) {
      subscribeCb = cb;
      return channel;
    },
    presenceState: vi.fn(() => presence),
    track: vi.fn(async () => {}),
    send: vi.fn(),
    // test helpers
    fire(event: string, arg?: BroadcastArg) {
      handlers[event]?.(arg ?? { payload: {} });
    },
    fireSubscribe(status: string) {
      return subscribeCb?.(status);
    },
    setPresence(next: Presence) {
      presence = next;
    },
  };
  return channel;
}

let channel: ReturnType<typeof makeFakeChannel>;

const MY_USER = 'me-123';
const OPP_USER = 'opp-456';

const baseOpts = () => ({
  gameId: 'g1',
  myRole: 0 as const,
  myUserId: MY_USER,
  onMoveReceived: vi.fn(),
  onOpponentResigned: vi.fn(),
  onOpponentTimeout: vi.fn(),
  onOpponentAborted: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  channel = makeFakeChannel();
  vi.mocked(supabase.channel).mockReturnValue(channel as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnlineGame subscription', () => {
  it('subscribes to the per-game topic with self-broadcast disabled', () => {
    renderHook(() => useOnlineGame(baseOpts()));
    expect(supabase.channel).toHaveBeenCalledWith('game:g1', {
      config: { broadcast: { self: false } },
    });
  });

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() => useOnlineGame(baseOpts()));
    unmount();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('goes ready and tracks presence once subscribed', async () => {
    const { result } = renderHook(() => useOnlineGame(baseOpts()));
    await act(async () => {
      await channel.fireSubscribe('SUBSCRIBED');
    });
    expect(result.current.connectionStatus).toBe('ready');
    expect(channel.track).toHaveBeenCalledWith({ userId: MY_USER });
  });
});

describe('useOnlineGame received broadcasts', () => {
  it('derives the opponent index from myRole, never trusting the payload', () => {
    const opts = { ...baseOpts(), myRole: 0 as const };
    renderHook(() => useOnlineGame(opts));
    const move: Move = { kind: 'pawn', to: { row: 1, col: 4 } };
    // Payload lies that it came from player 0 (me); the hook must ignore it.
    act(() => channel.fire('move', { payload: { move, playerIndex: 0 } }));
    expect(opts.onMoveReceived).toHaveBeenCalledWith(move, 1);
  });

  it('derives opponent index 0 when I am player 1', () => {
    const opts = { ...baseOpts(), myRole: 1 as const };
    renderHook(() => useOnlineGame(opts));
    const move: Move = { kind: 'pawn', to: { row: 7, col: 4 } };
    act(() => channel.fire('move', { payload: { move, playerIndex: 1 } }));
    expect(opts.onMoveReceived).toHaveBeenCalledWith(move, 0);
  });

  it('fires the resign / timeout / abort callbacks', () => {
    const opts = baseOpts();
    renderHook(() => useOnlineGame(opts));
    act(() => channel.fire('resign'));
    act(() => channel.fire('timeout'));
    act(() => channel.fire('abort'));
    expect(opts.onOpponentResigned).toHaveBeenCalledTimes(1);
    expect(opts.onOpponentTimeout).toHaveBeenCalledTimes(1);
    expect(opts.onOpponentAborted).toHaveBeenCalledTimes(1);
  });

  it('tracks opponent presence via the sync event', () => {
    const { result } = renderHook(() => useOnlineGame(baseOpts()));
    channel.setPresence({ a: [{ userId: OPP_USER }], b: [{ userId: MY_USER }] });
    act(() => channel.fire('sync'));
    expect(result.current.opponentConnected).toBe(true);

    channel.setPresence({ b: [{ userId: MY_USER }] });
    act(() => channel.fire('sync'));
    expect(result.current.opponentConnected).toBe(false);
  });
});

describe('useOnlineGame reconnect', () => {
  it('flips to reconnecting on a socket error and re-subscribes after backoff', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOnlineGame(baseOpts()));
    expect(supabase.channel).toHaveBeenCalledTimes(1);

    act(() => {
      channel.fireSubscribe('CHANNEL_ERROR');
    });
    expect(result.current.connectionStatus).toBe('reconnecting');

    // First backoff is min(1000 * 2**0, 10000) = 1000ms.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(supabase.channel).toHaveBeenCalledTimes(2);
  });
});

describe('useOnlineGame outbound broadcasts', () => {
  it('sends move / resign / timeout / abort with the caller as playerIndex', () => {
    const { result } = renderHook(() => useOnlineGame(baseOpts()));
    const move: Move = { kind: 'pawn', to: { row: 1, col: 4 } };

    act(() => result.current.broadcastMove(move));
    act(() => result.current.broadcastResign());
    act(() => result.current.broadcastTimeout());
    act(() => result.current.broadcastAbort());

    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'move',
      payload: { move, playerIndex: 0 },
    });
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'resign',
      payload: { playerIndex: 0 },
    });
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'timeout',
      payload: { playerIndex: 0 },
    });
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'abort',
      payload: {},
    });
  });
});

describe('useOnlineGame submitResult', () => {
  it('posts the result once and exposes the caller-side elo delta', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      game_id: 'g1',
      winner_id: MY_USER,
      elo_change_p1: 12,
      elo_change_p2: -13,
      new_elo_p1: 1512,
      new_elo_p2: 1487,
    });
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    await act(async () => {
      await result.current.submitResult(0, 'win', ['e2', 'e8']);
    });
    expect(result.current.result).toEqual({
      winner: 0,
      eloChange: 12,
      savedGameId: null,
      recordStatus: 'recorded',
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // A second submit is a no-op (guards double ELO writes).
    await act(async () => {
      await result.current.submitResult(0, 'win', ['e2', 'e8']);
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected result as unrecorded rather than a zero delta', async () => {
    // A 4xx is the server's verdict on this payload: no retry will change it.
    vi.mocked(apiFetch).mockRejectedValue(new ApiHttpError(422, 'nope'));
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    await act(async () => {
      await result.current.submitResult(1, 'resign', []);
    });
    expect(result.current.result).toEqual({
      winner: 1,
      eloChange: 0,
      savedGameId: null,
      recordStatus: 'failed',
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure until the result lands', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new ApiHttpError(503, 'cold start'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        game_id: 'g1',
        winner_id: MY_USER,
        elo_change_p1: 15,
        elo_change_p2: -16,
        new_elo_p1: 1515,
        new_elo_p2: 1484,
      });
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.submitResult(0, 'win', ['e2', 'e8']);
    });
    // The overlay goes up straight away rather than after the retries settle.
    expect(result.current.result?.recordStatus).toBe('recording');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
      await pending;
    });
    expect(result.current.result).toEqual({
      winner: 0,
      eloChange: 15,
      savedGameId: null,
      recordStatus: 'recorded',
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retries and offers the failure back to the caller', async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.submitResult(0, 'win', ['e2']);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
      await pending;
    });

    expect(result.current.result?.recordStatus).toBe('failed');
    // One attempt per retry delay, plus the first.
    expect(apiFetch).toHaveBeenCalledTimes(4);

    // Try again re-sends exactly the same claim.
    vi.mocked(apiFetch).mockResolvedValue({
      game_id: 'g1',
      winner_id: MY_USER,
      elo_change_p1: 9,
      elo_change_p2: -10,
      new_elo_p1: 1509,
      new_elo_p2: 1490,
    });
    await act(async () => {
      await result.current.retrySubmitResult();
    });
    expect(result.current.result?.recordStatus).toBe('recorded');
    expect(result.current.result?.eloChange).toBe(9);
    const lastBody = JSON.parse(vi.mocked(apiFetch).mock.calls.at(-1)![1]!.body as string);
    expect(lastBody).toMatchObject({ winner_index: 0, reason: 'win', move_history: ['e2'] });
  });

  it('posts a disconnect-forfeit result with the caller as winner', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      game_id: 'g1',
      winner_id: MY_USER,
      elo_change_p1: 8,
      elo_change_p2: -9,
      new_elo_p1: 1508,
      new_elo_p2: 1491,
    });
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    await act(async () => {
      await result.current.submitResult(0, 'disconnect', ['e2']);
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/games/g1/result',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ winner_index: 0, reason: 'disconnect', move_history: ['e2'] });
    expect(result.current.result).toEqual({
      winner: 0,
      eloChange: 8,
      savedGameId: null,
      recordStatus: 'recorded',
    });
  });

  it('observeResult shows the outcome without posting a result', () => {
    const { result } = renderHook(() => useOnlineGame(baseOpts()));
    act(() => result.current.observeResult(1, 'saved-9'));
    expect(result.current.result).toEqual({
      winner: 1,
      eloChange: 0,
      savedGameId: 'saved-9',
      recordStatus: 'observed',
    });
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/result'),
      expect.anything(),
    );
  });

  it('observeResult reads the delta back once the other side records it', async () => {
    // The winner of a forfeit cannot submit the result, so without this read they are
    // shown no rating change at all despite their rating having moved.
    vi.useFakeTimers();
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ elo_change_p1: null, elo_change_p2: null })
      .mockResolvedValueOnce({ elo_change_p1: 11, elo_change_p2: -12 });
    const { result } = renderHook(() => useOnlineGame(baseOpts()));

    act(() => result.current.observeResult(0, 'saved-1'));
    expect(result.current.result?.eloChange).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(apiFetch).toHaveBeenCalledWith('/games/g1');
    expect(result.current.result?.eloChange).toBe(11);
    expect(result.current.result?.recordStatus).toBe('observed');
  });
});
