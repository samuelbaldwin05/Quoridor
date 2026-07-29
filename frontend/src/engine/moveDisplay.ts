import { applyMove, createInitialState } from './gameEngine';
import type { GameState, Move, StoredMove } from './gameTypes';

// Replay the first `index` moves of a stored history into a board state, used by
// the move-list scrubber on the game / online / history pages.
export function replayToIndex(moves: StoredMove[], index: number): GameState {
  let state: GameState = { ...createInitialState(), status: 'playing' };
  for (let i = 0; i < index; i++) {
    const result = applyMove(state, moves[i]!.move);
    if (result.valid) state = result.nextState;
  }
  return state;
}

// Glyph shown next to a move in the move list.
export function moveIcon(move: Move): string {
  return move.kind === 'pawn' ? '♟' : '⊟';
}
