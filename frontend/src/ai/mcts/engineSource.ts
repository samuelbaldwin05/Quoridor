import { makeBot0Move } from '@/ai/bots/bot0';
import { makeBot2Move } from '@/ai/bots/bot2';
import type { GameState, PlayerIndex } from '@/engine/gameTypes';
import type { EngineDecision } from './mctsTypes';
import { chooseMoveOnServer, ServerEngineUnavailable } from './serverEngine';
import { wasmEngine } from './wasmEngine';

/**
 * Picks where the MCTS tier's move comes from, in order:
 *
 *   1. the backend, so strength is the same for everyone
 *   2. the WASM engine in a worker, when the backend cannot serve the move
 *   3. bot2, so a turn can never hang
 *
 * The server is tried first on every move rather than being latched, because saturation is
 * transient: one shed request should not downgrade the rest of the game. A server that is
 * missing the engine entirely answers 503 immediately, which is cheap enough to re-ask.
 */

export type EngineSourcePreference = 'auto' | 'server' | 'wasm';

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (err instanceof Error && err.name === 'AbortError');
}

function fallbackToBot2(
  state: GameState,
  aiPlayerIndex: PlayerIndex,
  reason: string,
): EngineDecision {
  // bot2 declines in positions it has no opinion about, so bot0 backs up the backup. Both
  // declining means the position has no legal move at all, which the rules make impossible:
  // a fence may only be placed if both players still have a path.
  const { decision } = makeBot2Move(state, aiPlayerIndex, {
    moveCount: 0,
    openingPattern: null,
    openingStep: 0,
  });
  const chosen = decision ?? makeBot0Move(state, aiPlayerIndex);
  if (!chosen) throw new Error('no legal move available in this position');

  return {
    move: chosen.move,
    stats: {
      source: 'fallback',
      iterations: 0,
      elapsedMs: 0,
      targetIterations: 0,
      threads: 0,
      cached: false,
      engineCommit: reason,
    },
  };
}

export async function chooseEngineMove(
  state: GameState,
  aiPlayerIndex: PlayerIndex,
  preference: EngineSourcePreference = 'auto',
  signal?: AbortSignal,
): Promise<EngineDecision> {
  const reasons: string[] = [];

  if (preference !== 'wasm') {
    try {
      return await chooseMoveOnServer(state, signal);
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      if (preference === 'server') throw err;
      reasons.push(err instanceof ServerEngineUnavailable ? err.message : `server: ${String(err)}`);
    }
  }

  if (wasmEngine.supported()) {
    try {
      return await wasmEngine.chooseMove(state, signal);
    } catch (err) {
      if (isAbort(err, signal)) throw err;
      reasons.push(`wasm: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    reasons.push('wasm: unsupported');
  }

  console.warn('MCTS engine unavailable, falling back to bot2:', reasons.join('; '));
  return fallbackToBot2(state, aiPlayerIndex, 'bot2 fallback');
}
