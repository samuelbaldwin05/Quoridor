import { useEffect, useRef } from 'react';
import { makeAiMove } from '@/ai/aiCoordinator';
import { AI_MOVE_DELAY_MS } from '@/engine/constants';
import type { FullState, GameAction } from './gameReducer';

export function useAi(
  state: FullState,
  dispatch: React.Dispatch<GameAction>,
): void {
  const { game, aiContext, settings } = state;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (game.status !== 'playing' || game.currentPlayerIndex !== 1) return;

    const runAi = () => {
      const { decision, nextContext } = makeAiMove(game, aiContext);
      if (decision) {
        dispatch({ type: 'APPLY_AI_MOVE', decision, nextAiContext: nextContext });
      }
    };

    if (settings.aiDelayEnabled) {
      timerRef.current = setTimeout(runAi, AI_MOVE_DELAY_MS);
    } else {
      runAi();
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [game, aiContext, settings.aiDelayEnabled, dispatch]);
}
