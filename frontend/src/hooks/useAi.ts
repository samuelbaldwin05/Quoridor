import { useEffect, useRef } from 'react';
import { makeAiMove } from '@/ai/aiCoordinator';
import { AI_MOVE_DELAY_MS } from '@/engine/constants';
import type { FullState, GameAction } from './gameReducer';

/**
 * Waits out the remainder of `ms`, resolving early only if aborted.
 *
 * The delay exists so instant bots do not answer before the player has seen their own move
 * land. A searching bot spends real time thinking, so the two overlap instead of stacking:
 * a 1.5s search still feels like 1.5s, not 2.5s.
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

export function useAi(state: FullState, dispatch: React.Dispatch<GameAction>): void {
  const { game, aiContext, settings } = state;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (settings.gameMode === 'pass-and-play') return;
    if (game.status !== 'playing' || game.currentPlayerIndex !== 1) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const runAi = async () => {
      const startedAt = Date.now();
      try {
        const { decision, nextContext } = await makeAiMove(game, aiContext, controller.signal);
        if (controller.signal.aborted) return;

        if (settings.aiDelayEnabled) {
          await sleep(AI_MOVE_DELAY_MS - (Date.now() - startedAt), controller.signal);
          if (controller.signal.aborted) return;
        }

        if (decision) {
          dispatch({ type: 'APPLY_AI_MOVE', decision, nextAiContext: nextContext });
        }
      } catch (err) {
        // Aborts are expected when the game state changes mid-search; ignore.
        if (controller.signal.aborted) return;
        console.error('AI move failed:', err);
      }
    };

    void runAi();

    return () => {
      controller.abort();
    };
  }, [game, aiContext, settings.gameMode, settings.aiDelayEnabled, dispatch]);
}
