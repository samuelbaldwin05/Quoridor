import { describe, expect, it } from 'vitest';
import { applyMove, createInitialState } from '@/engine/gameEngine';
import { parseMove } from '@/engine/notation';
import type { GameState } from '@/engine/gameTypes';
import { AI_CONFIG } from '@/engine/constants';
import {
  calculateFenceDistance,
  calculateFenceProximityPenalty,
  calculateOpposingPlayerPenalty,
  dijkstraDistance,
  findBestMoveWithDijkstra,
  findWinningMove,
  getShortestPathFromPosition,
} from '../pathfinder';
import { makeBot0Move } from '../bots/bot0';
import { makeBot1Move } from '../bots/bot1';
import { makeBot2Move } from '../bots/bot2';

function playingAfter(moves: string[]): GameState {
  let state: GameState = { ...createInitialState(), status: 'playing' };
  for (const m of moves) {
    state = applyMove(state, parseMove(m)).nextState;
  }
  return state;
}

// ── pure penalty / helper functions ───────────────────────────────────────────

describe('findWinningMove', () => {
  it('returns the move on the goal row', () => {
    const moves = [
      { row: 1, col: 4 },
      { row: 0, col: 4 },
    ];
    expect(findWinningMove(moves, 0)).toEqual({ row: 0, col: 4 });
  });

  it('returns null when no move reaches the goal row', () => {
    expect(findWinningMove([{ row: 2, col: 4 }], 0)).toBeNull();
  });
});

describe('calculateOpposingPlayerPenalty', () => {
  it('penalizes an orthogonally-adjacent square', () => {
    expect(calculateOpposingPlayerPenalty({ row: 4, col: 4 }, { row: 4, col: 5 })).toBe(
      AI_CONFIG.OPPOSING_PLAYER_PENALTY,
    );
  });
  it('penalizes a diagonally-adjacent square', () => {
    expect(calculateOpposingPlayerPenalty({ row: 4, col: 4 }, { row: 5, col: 5 })).toBe(
      AI_CONFIG.OPPOSING_PLAYER_PENALTY,
    );
  });
  it('does not penalize the same square or a far square', () => {
    expect(calculateOpposingPlayerPenalty({ row: 4, col: 4 }, { row: 4, col: 4 })).toBe(0);
    expect(calculateOpposingPlayerPenalty({ row: 4, col: 4 }, { row: 4, col: 7 })).toBe(0);
  });
});

describe('fence proximity', () => {
  it('is zero when there are no walls', () => {
    expect(calculateFenceProximityPenalty([], { row: 4, col: 4 })).toBe(0);
    expect(calculateFenceDistance([], { row: 4, col: 4 })).toBe(Infinity);
  });

  it('applies the ADJACENT penalty on a wall-anchor square', () => {
    const walls = [{ row: 4, col: 4, orientation: 'h' as const }];
    // (4,4) is one of the wall's affected squares -> distance 0 -> ADJACENT penalty.
    expect(calculateFenceProximityPenalty(walls, { row: 4, col: 4 })).toBe(
      AI_CONFIG.FENCE_PROXIMITY_PENALTIES.ADJACENT,
    );
    expect(calculateFenceDistance(walls, { row: 4, col: 4 })).toBe(0);
  });
});

// ── dijkstra ───────────────────────────────────────────────────────────────────

describe('dijkstraDistance', () => {
  it('equals the straight-line distance on an empty board with the opponent far away', () => {
    // p0 at (8,8) heading to row 0; p1 parked at (0,0) so it never adds a penalty.
    const base = createInitialState();
    const state: GameState = {
      ...base,
      status: 'playing',
      players: [
        { ...base.players[0], position: { row: 8, col: 8 } },
        { ...base.players[1], position: { row: 0, col: 0 } },
      ],
    };
    expect(dijkstraDistance(state, { row: 8, col: 8 }, 0)).toBe(8);
  });

  it('increases but stays finite when a wall forces a detour', () => {
    const base = createInitialState();
    const empty: GameState = {
      ...base,
      status: 'playing',
      players: [
        { ...base.players[0], position: { row: 8, col: 8 } },
        { ...base.players[1], position: { row: 0, col: 0 } },
      ],
    };
    const walled: GameState = { ...empty, walls: [{ row: 0, col: 7, orientation: 'h' }] };
    const d = dijkstraDistance(walled, { row: 8, col: 8 }, 0);
    expect(d).toBeGreaterThan(8);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe('getShortestPathFromPosition', () => {
  it('returns a path from the start to the goal row', () => {
    const state = playingAfter([]);
    const { path } = getShortestPathFromPosition(state, 0);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toEqual(state.players[0].position); // starts where the pawn is
    expect(path[path.length - 1]!.row).toBe(0); // ends on p0's goal row
  });
});

describe('findBestMoveWithDijkstra', () => {
  it('steps toward the goal from the opening position', () => {
    const state = playingAfter([]);
    const move = findBestMoveWithDijkstra(state, 0); // p0 goal is row 0
    expect(move).toEqual({ row: 7, col: 4 });
  });
});

// ── bots: every returned move must be legal ───────────────────────────────────

const OPENING = playingAfter(['e2']); // p1 to move
const MIDGAME = playingAfter(['e2', 'e8', 'e7h']); // p1 to move, one wall on the board

describe('bots return only legal moves', () => {
  for (const state of [OPENING, MIDGAME]) {
    // bots are non-deterministic (random tie-breaks / wall choices); run several
    // times so a randomness-dependent illegal move can't slip through.
    it('bot0 always returns a move applyMove accepts', () => {
      for (let i = 0; i < 25; i++) {
        const decision = makeBot0Move(state, 1);
        expect(decision).not.toBeNull();
        expect(applyMove(state, decision!.move).valid).toBe(true);
      }
    });

    it('bot1 always returns a move applyMove accepts', () => {
      for (let i = 0; i < 25; i++) {
        const decision = makeBot1Move(state, 1, { moveCount: 0, previousPosition: null });
        expect(decision).not.toBeNull();
        expect(applyMove(state, decision!.move).valid).toBe(true);
      }
    });

    it('bot2 always returns a move applyMove accepts', () => {
      for (let i = 0; i < 25; i++) {
        const { decision } = makeBot2Move(state, 1, {
          moveCount: 0,
          openingPattern: null,
          openingStep: 0,
        });
        expect(decision).not.toBeNull();
        expect(applyMove(state, decision!.move).valid).toBe(true);
      }
    });
  }
});
