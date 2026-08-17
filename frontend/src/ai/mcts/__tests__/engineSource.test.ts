import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '@/engine/gameEngine';
import type { GameState } from '@/engine/gameTypes';
import { getValidPawnMoves } from '@/engine/moveValidation';
import { chooseEngineMove } from '../engineSource';

// The real one reaches for a Supabase session, which needs a browser and configured env. The
// header itself is not what these tests are about; the ladder is.
const getAuthHeader = vi.hoisted(() => vi.fn(async () => 'Bearer test-token'));
vi.mock('@/lib/api', () => ({ getAuthHeader }));

/**
 * These run in the node test environment, where `Worker` does not exist, so the WASM rung of
 * the ladder reports itself unsupported and the fallback path is what gets exercised. That is
 * the case worth pinning: a server that cannot answer must not leave the bot without a move.
 */

function playingState(): GameState {
  return { ...createInitialState(), status: 'playing', currentPlayerIndex: 1 };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  getAuthHeader.mockResolvedValue('Bearer test-token');
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(response: Response | Promise<Response> | Error) {
  globalThis.fetch = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('chooseEngineMove', () => {
  it('uses the server move when the backend answers', async () => {
    stubFetch(
      jsonResponse({
        move: { kind: 'pawn', to: { row: 1, col: 4 } },
        stats: {
          iterations: 8000,
          elapsed_ms: 1200,
          target_iterations: 8000,
          threads: 2,
          cached: false,
          engine_commit: 'abc1234',
        },
      }),
    );

    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('server');
    expect(decision.stats.iterations).toBe(8000);
    expect(decision.move).toEqual({ kind: 'pawn', to: { row: 1, col: 4 } });
  });

  it('accepts a server response with no stats block', async () => {
    stubFetch(jsonResponse({ move: { kind: 'wall', wall: { row: 3, col: 3, orientation: 'h' } } }));

    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('server');
    expect(decision.move).toEqual({
      kind: 'wall',
      wall: { row: 3, col: 3, orientation: 'h' },
    });
  });

  it('falls back to a local move when the engine is saturated', async () => {
    stubFetch(new Response('{"detail":"saturated"}', { status: 503 }));

    const state = playingState();
    const decision = await chooseEngineMove(state, 1);

    expect(decision.stats.source).toBe('fallback');
    if (decision.move.kind === 'pawn') {
      const legal = getValidPawnMoves(state, 1).map((p) => `${p.row},${p.col}`);
      expect(legal).toContain(`${decision.move.to.row},${decision.move.to.col}`);
    }
  });

  it('falls back when the network is down', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('fallback');
  });

  it('falls back when the server sends a response it cannot parse', async () => {
    stubFetch(jsonResponse({ move: { kind: 'teleport' } }));
    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('fallback');
  });

  it('rethrows instead of falling back when the caller demands the server', async () => {
    stubFetch(new Response('nope', { status: 503 }));
    await expect(chooseEngineMove(playingState(), 1, 'server')).rejects.toThrow(
      /engine unavailable/,
    );
  });

  it('skips the server entirely when asked for the client engine', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const decision = await chooseEngineMove(playingState(), 1, 'wasm');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(decision.stats.source).toBe('fallback'); // no Worker in this environment
  });

  it('propagates an abort rather than treating it as an engine failure', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn((_url, init?: RequestInit) => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError', init }));
    }) as unknown as typeof fetch;

    await expect(chooseEngineMove(playingState(), 1, 'auto', controller.signal)).rejects.toThrow(
      /aborted/,
    );
  });
});

describe('identifying the caller', () => {
  it('sends the bearer token, because the engine tier is members-only', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ move: { kind: 'pawn', to: { row: 1, col: 4 } } }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await chooseEngineMove(playingState(), 1);

    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('omits the header for a guest rather than sending a broken one', async () => {
    getAuthHeader.mockResolvedValue(null as unknown as string);
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ move: { kind: 'pawn', to: { row: 1, col: 4 } } }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await chooseEngineMove(playingState(), 1);

    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('still attempts the move when the session lookup itself fails', async () => {
    getAuthHeader.mockRejectedValue(new Error('supabase unreachable'));
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ move: { kind: 'pawn', to: { row: 1, col: 4 } } }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('server');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('treats a 403 as a reason to use another source, not an error', async () => {
    // What a guest hits if they reach the tier anyway: signed out mid-game, or an expired token.
    stubFetch(new Response('{"detail":"members only"}', { status: 403 }));
    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('fallback');
  });

  it('treats a 401 the same way', async () => {
    stubFetch(new Response('{"detail":"invalid token"}', { status: 401 }));
    const decision = await chooseEngineMove(playingState(), 1);
    expect(decision.stats.source).toBe('fallback');
  });
});
