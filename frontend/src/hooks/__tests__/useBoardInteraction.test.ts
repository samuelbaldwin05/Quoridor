// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/gameStorage', () => ({ saveGame: vi.fn(() => 'saved-game-id') }));
vi.mock('@/lib/settingsStorage', () => ({ saveSettings: vi.fn() }));

import { SettingsSchema } from '@/lib/schemas/settingsSchemas';
import { gameReducer, createInitialFullState, type FullState } from '@/hooks/gameReducer';
import { useBoardInteraction } from '@/hooks/useBoardInteraction';
import type { Wall } from '@/engine/gameTypes';

function playing(): FullState {
  return gameReducer(createInitialFullState(SettingsSchema.parse({})), { type: 'START_GAME' });
}

const WALL: Wall = { row: 4, col: 4, orientation: 'h' };

describe('useBoardInteraction wall preview', () => {
  it('previews on the first tap and commits on a second tap of the same slot', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useBoardInteraction(playing(), dispatch, true));

    act(() => result.current.handleWallClick(WALL));
    expect(result.current.wallPreview).toEqual(WALL);
    expect(dispatch).not.toHaveBeenCalled();

    act(() => result.current.handleWallClick(WALL));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPLY_MOVE',
      move: { kind: 'wall', wall: WALL },
    });
    expect(result.current.wallPreview).toBeNull();
  });

  it('drops a tapped preview once a move lands, so it cannot outlive its turn', () => {
    const dispatch = vi.fn();
    const state = playing();
    const { result, rerender } = renderHook(
      ({ s }: { s: FullState }) => useBoardInteraction(s, dispatch, true),
      { initialProps: { s: state } },
    );

    // Preview a wall, then move the pawn instead: the ghost has to go.
    act(() => result.current.handleWallClick(WALL));
    expect(result.current.wallPreview).toEqual(WALL);

    const moved = gameReducer(state, {
      type: 'APPLY_MOVE',
      move: { kind: 'pawn', to: { row: 7, col: 4 } },
    });
    rerender({ s: moved });
    expect(result.current.wallPreview).toBeNull();

    // Back on our turn the stale ghost must still be gone.
    const backToUs = gameReducer(moved, {
      type: 'APPLY_ONLINE_MOVE',
      move: { kind: 'pawn', to: { row: 1, col: 4 } },
      playerIndex: 1,
    });
    rerender({ s: backToUs });
    expect(result.current.wallPreview).toBeNull();
  });

  it('leaves the hover preview to the pointer when confirm mode is off', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useBoardInteraction(playing(), dispatch, false));

    act(() => result.current.handleWallHover(WALL));
    expect(result.current.wallPreview).toEqual(WALL);

    act(() => result.current.handleWallHover(null));
    expect(result.current.wallPreview).toBeNull();
  });
});
