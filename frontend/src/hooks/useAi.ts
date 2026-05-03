import { useEffect, useRef } from 'react';
import { makeAiMove } from '@/ai/aiCoordinator';
import { AI_MOVE_DELAY_MS } from '@/engine/constants';
import type { FullState, GameAction } from './gameReducer';

export function useAi(state: FullState, dispatch: React.Dispatch<GameAction>): void {
  const { game, aiContext, settings } = state;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;

    if (settings.gameMode === 'pass-and-play') return;
    if (game.status !== 'playing' || game.currentPlayerIndex !== 1) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const runAi = async () => {
      try {
        const { decision, nextContext } = await makeAiMove(game, aiContext, controller.signal);
        if (controller.signal.aborted) return;
        if (decision) {
          dispatch({ type: 'APPLY_AI_MOVE', decision, nextAiContext: nextContext });
        }
      } catch (err) {
        // Aborts are expected when the game state changes mid-fetch; ignore.
        if (controller.signal.aborted) return;
        console.error('AI move failed:', err);
      }
    };

    if (settings.aiDelayEnabled) {
      timerRef.current = setTimeout(() => {
        void runAi();
      }, AI_MOVE_DELAY_MS);
    } else {
      void runAi();
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      controller.abort();
    };
  }, [game, aiContext, settings.gameMode, settings.aiDelayEnabled, dispatch]);
}
