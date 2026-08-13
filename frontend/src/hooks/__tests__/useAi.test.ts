// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiContext, AiDecision } from '@/ai/aiTypes';
import { AI_MOVE_DELAY_MS } from '@/engine/constants';
import { createInitialState } from '@/engine/gameEngine';
import type { GameState } from '@/engine/gameTypes';
import { loadSettings } from '@/lib/settingsStorage';
import type { FullState } from '../gameReducer';
import { useAi } from '../useAi';

const makeAiMove = vi.hoisted(() => vi.fn());
vi.mock('@/ai/aiCoordinator', () => ({ makeAiMove }));

const PAWN_MOVE: AiDecision = { move: { kind: 'pawn', to: { row: 1, col: 4 } }, message: 'ok' };

function state(overrides: {
  game?: Partial<GameState>;
  aiDelayEnabled?: boolean;
  difficulty?: FullState['settings']['difficulty'];
}): FullState {
  const settings = {
    ...loadSettings(),
    gameMode: 'vs-bot' as const,
    aiDelayEnabled: overrides.aiDelayEnabled ?? true,
    difficulty: overrides.difficulty ?? ('mcts' as const),
  };
  return {
    game: {
      ...createInitialState(),
      status: 'playing',
      currentPlayerIndex: 1, // the bot's turn
      ...overrides.game,
    },
    score: { player: 0, computer: 0 },
    message: null,
    aiContext: { difficulty: 'mcts', mcts: { moveCount: 0, lastStats: null } } as AiContext,
    settings,
    moveHistory: [],
    lastSavedGameId: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  makeAiMove.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAi', () => {
  it('waits out the full delay when the bot answers instantly', async () => {
    makeAiMove.mockResolvedValue({
      decision: PAWN_MOVE,
      nextContext: { difficulty: 'mcts', mcts: { moveCount: 1, lastStats: null } },
    });
    const dispatch = vi.fn();

    renderHook(() => useAi(state({}), dispatch));

    await vi.advanceTimersByTimeAsync(AI_MOVE_DELAY_MS - 50);
    expect(dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'APPLY_AI_MOVE' });
  });

  it('does not stack the delay on top of a slow search', async () => {
    // A search that itself outlasts the delay should apply as soon as it finishes. Stacking
    // the two would make a thinking bot feel twice as slow as it is.
    const searchMs = AI_MOVE_DELAY_MS * 2;
    makeAiMove.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                decision: PAWN_MOVE,
                nextContext: { difficulty: 'mcts', mcts: { moveCount: 1, lastStats: null } },
              }),
            searchMs,
          ),
        ),
    );
    const dispatch = vi.fn();

    renderHook(() => useAi(state({}), dispatch));

    await vi.advanceTimersByTimeAsync(searchMs - 50);
    expect(dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('applies immediately when the delay is switched off', async () => {
    makeAiMove.mockResolvedValue({
      decision: PAWN_MOVE,
      nextContext: { difficulty: 'mcts', mcts: { moveCount: 1, lastStats: null } },
    });
    const dispatch = vi.fn();

    renderHook(() => useAi(state({ aiDelayEnabled: false }), dispatch));

    await vi.advanceTimersByTimeAsync(0);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not run on the human turn or in pass and play', async () => {
    const dispatch = vi.fn();
    const human = state({ game: { currentPlayerIndex: 0 } });
    renderHook(() => useAi(human, dispatch));
    await vi.advanceTimersByTimeAsync(AI_MOVE_DELAY_MS * 2);

    const passAndPlay = { ...human, settings: { ...human.settings, gameMode: 'pass-and-play' } };
    renderHook(() => useAi(passAndPlay as FullState, dispatch));
    await vi.advanceTimersByTimeAsync(AI_MOVE_DELAY_MS * 2);

    expect(makeAiMove).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('drops a move whose search finished after the hook was torn down', async () => {
    makeAiMove.mockResolvedValue({
      decision: PAWN_MOVE,
      nextContext: { difficulty: 'mcts', mcts: { moveCount: 1, lastStats: null } },
    });
    const dispatch = vi.fn();

    const { unmount } = renderHook(() => useAi(state({}), dispatch));
    unmount();

    await vi.advanceTimersByTimeAsync(AI_MOVE_DELAY_MS * 2);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('passes an abort signal the search can observe', async () => {
    makeAiMove.mockResolvedValue({
      decision: PAWN_MOVE,
      nextContext: { difficulty: 'mcts', mcts: { moveCount: 1, lastStats: null } },
    });

    const { unmount } = renderHook(() => useAi(state({}), vi.fn()));
    await vi.advanceTimersByTimeAsync(0);

    const signal = makeAiMove.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
