import { BOARD_SIZE } from '@/engine/constants';
import type { GameState, Move, Orientation, PlayerIndex } from '@/engine/gameTypes';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import type { EngineStateWire } from './mctsTypes';

/**
 * Translation between this app's game state and the C++ engine's.
 *
 * Pure functions, no WASM: everything here is unit-tested without the engine binary, which
 * matters because the player mapping is the one part of this integration that fails silently.
 * The engine's p1 is internal player 0, hardcoded to start on row 0 and run to row 8; its p2
 * runs to row 0. The app numbers its players the other way round, so the mapping keys on
 * goalRow rather than on array position.
 *
 * Board geometry is identical on both sides: a wall at (row, col, 'h') blocks the same
 * groove in both, so only player identity is ever swapped, never coordinates.
 */

export const FENCE_GRID = BOARD_SIZE - 1;

// Action index layout, mirroring include/quoridor/config.hpp in the engine repo.
export const NUM_MOVE_ACTIONS = 8;
export const H_WALL_OFFSET = NUM_MOVE_ACTIONS;
export const V_WALL_OFFSET = H_WALL_OFFSET + FENCE_GRID * FENCE_GRID;
export const PASS_ACTION = V_WALL_OFFSET + FENCE_GRID * FENCE_GRID;

/**
 * Pawn action index to (row delta, col delta), matching apply_action in the engine's
 * src/mcts/mcts.cpp. These are directions, not destinations: a jump over the opponent shares
 * an index with the single step in the same direction, so an index is resolved by scanning
 * the legal moves for one whose delta has the same signs.
 */
const PAWN_DELTAS: readonly (readonly [number, number])[] = [
  [-1, 0], // 0 up
  [1, 0], // 1 down
  [0, -1], // 2 left
  [0, 1], // 3 right
  [-1, -1], // 4 up-left
  [-1, 1], // 5 up-right
  [1, -1], // 6 down-left
  [1, 1], // 7 down-right
];

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Which app player index the engine treats as its p1 (the one running to row 8). */
export function enginePlayerOneIndex(state: GameState): PlayerIndex {
  return state.players[0].goalRow === BOARD_SIZE - 1 ? 0 : 1;
}

export function toEngineState(state: GameState): EngineStateWire {
  const p1Index = enginePlayerOneIndex(state);
  const p2Index: PlayerIndex = p1Index === 0 ? 1 : 0;
  const p1 = state.players[p1Index];
  const p2 = state.players[p2Index];

  const hWalls = new Uint8Array(FENCE_GRID * FENCE_GRID);
  const vWalls = new Uint8Array(FENCE_GRID * FENCE_GRID);
  for (const wall of state.walls) {
    if (wall.row < 0 || wall.row >= FENCE_GRID || wall.col < 0 || wall.col >= FENCE_GRID) continue;
    const grid = wall.orientation === 'h' ? hWalls : vWalls;
    grid[wall.row * FENCE_GRID + wall.col] = 1;
  }

  return {
    p1Row: p1.position.row,
    p1Col: p1.position.col,
    p2Row: p2.position.row,
    p2Col: p2.position.col,
    p1Walls: p1.wallsRemaining,
    p2Walls: p2.wallsRemaining,
    turn: state.currentPlayerIndex === p1Index ? 0 : 1,
    hWalls,
    vWalls,
  };
}

/**
 * Turn an engine action index into a Move, or null when it decodes to nothing this engine
 * will accept. Callers treat null as "use another source" rather than applying it blindly.
 */
export function decodeAction(action: number, state: GameState): Move | null {
  if (!Number.isInteger(action) || action < 0 || action >= PASS_ACTION) return null;

  if (action < NUM_MOVE_ACTIONS) {
    const [dRow, dCol] = PAWN_DELTAS[action];
    const origin = state.players[state.currentPlayerIndex].position;
    for (const candidate of getValidPawnMoves(state, state.currentPlayerIndex)) {
      if (sign(candidate.row - origin.row) === dRow && sign(candidate.col - origin.col) === dCol) {
        return { kind: 'pawn', to: candidate };
      }
    }
    return null;
  }

  const isHorizontal = action < V_WALL_OFFSET;
  const index = action - (isHorizontal ? H_WALL_OFFSET : V_WALL_OFFSET);
  const orientation: Orientation = isHorizontal ? 'h' : 'v';
  const wall = {
    row: Math.floor(index / FENCE_GRID),
    col: index % FENCE_GRID,
    orientation,
  };

  if (state.players[state.currentPlayerIndex].wallsRemaining <= 0) return null;
  if (!isValidWallPlacement(state, wall)) return null;
  return { kind: 'wall', wall };
}
