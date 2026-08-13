import { describe, expect, it } from 'vitest';
import type { GameState, PlayerIndex, Wall } from '@/engine/gameTypes';
import { getValidPawnMoves, isValidWallPlacement } from '@/engine/moveValidation';
import { blendSpeed, budgetFor, MCTS_BUDGET } from '../budget';
import {
  decodeAction,
  enginePlayerOneIndex,
  FENCE_GRID,
  H_WALL_OFFSET,
  NUM_MOVE_ACTIONS,
  PASS_ACTION,
  toEngineState,
  V_WALL_OFFSET,
} from '../stateMapping';

function makeState(overrides: {
  p0?: [number, number];
  p1?: [number, number];
  p0Walls?: number;
  p1Walls?: number;
  walls?: Wall[];
  current?: PlayerIndex;
}): GameState {
  return {
    players: [
      {
        position: { row: overrides.p0?.[0] ?? 8, col: overrides.p0?.[1] ?? 4 },
        wallsRemaining: overrides.p0Walls ?? 10,
        goalRow: 0,
      },
      {
        position: { row: overrides.p1?.[0] ?? 0, col: overrides.p1?.[1] ?? 4 },
        wallsRemaining: overrides.p1Walls ?? 10,
        goalRow: 8,
      },
    ],
    walls: overrides.walls ?? [],
    currentPlayerIndex: overrides.current ?? 0,
    status: 'playing',
    winner: null,
  };
}

describe('action layout', () => {
  it('matches the engine constants in quoridor/config.hpp', () => {
    expect(FENCE_GRID).toBe(8);
    expect(NUM_MOVE_ACTIONS).toBe(8);
    expect(H_WALL_OFFSET).toBe(8);
    expect(V_WALL_OFFSET).toBe(72);
    expect(PASS_ACTION).toBe(136);
  });
});

describe('toEngineState', () => {
  it('maps the app player running to row 8 onto the engine p1', () => {
    // The single most dangerous mapping here. The engine's p1 is hardcoded to run to row 8,
    // and this app's player 1 is the one with goalRow 8. Lining these up by index instead
    // would give a bot that races the wrong way while still returning legal moves.
    const state = makeState({ p0: [7, 4], p1: [1, 3], p0Walls: 9, p1Walls: 8 });
    const wire = toEngineState(state);

    expect(enginePlayerOneIndex(state)).toBe(1);
    expect([wire.p1Row, wire.p1Col]).toEqual([1, 3]);
    expect([wire.p2Row, wire.p2Col]).toEqual([7, 4]);
    expect(wire.p1Walls).toBe(8);
    expect(wire.p2Walls).toBe(9);
  });

  it('flips the turn to match the swapped players', () => {
    expect(toEngineState(makeState({ current: 0 })).turn).toBe(1);
    expect(toEngineState(makeState({ current: 1 })).turn).toBe(0);
  });

  it('keys on goalRow, so a state with the players listed the other way still maps', () => {
    const swapped: GameState = {
      players: [
        { position: { row: 0, col: 4 }, wallsRemaining: 10, goalRow: 8 },
        { position: { row: 8, col: 4 }, wallsRemaining: 10, goalRow: 0 },
      ],
      walls: [],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    };
    const wire = toEngineState(swapped);
    expect([wire.p1Row, wire.p1Col]).toEqual([0, 4]);
    expect([wire.p2Row, wire.p2Col]).toEqual([8, 4]);
    expect(wire.turn).toBe(0);
  });

  it('writes walls into the same cells the engine indexes', () => {
    const wire = toEngineState(
      makeState({
        walls: [
          { row: 2, col: 4, orientation: 'h' },
          { row: 5, col: 3, orientation: 'v' },
        ],
      }),
    );
    expect(wire.hWalls[2 * FENCE_GRID + 4]).toBe(1);
    expect(wire.vWalls[5 * FENCE_GRID + 3]).toBe(1);
    expect(wire.hWalls.reduce((a, b) => a + b, 0)).toBe(1);
    expect(wire.vWalls.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('sends grids the engine expects, 64 entries each', () => {
    const wire = toEngineState(makeState({}));
    expect(wire.hWalls.length).toBe(64);
    expect(wire.vWalls.length).toBe(64);
  });
});

describe('decodeAction', () => {
  it('turns the four straight directions into the adjacent square', () => {
    const state = makeState({ p0: [4, 4], p1: [0, 4], current: 0 });
    const cases: [number, [number, number]][] = [
      [0, [3, 4]],
      [1, [5, 4]],
      [2, [4, 3]],
      [3, [4, 5]],
    ];
    for (const [action, expected] of cases) {
      const move = decodeAction(action, state);
      expect(move?.kind).toBe('pawn');
      if (move?.kind === 'pawn') expect([move.to.row, move.to.col]).toEqual(expected);
    }
  });

  it('resolves a direction to a jump rather than the occupied square', () => {
    // Index 0 is "up", and up is the opponent, so it has to decode to the square beyond.
    const state = makeState({ p0: [4, 4], p1: [3, 4], current: 0 });
    const move = decodeAction(0, state);
    expect(move?.kind).toBe('pawn');
    if (move?.kind === 'pawn') expect([move.to.row, move.to.col]).toEqual([2, 4]);
  });

  it('decodes the diagonal jumps when the straight jump is walled off', () => {
    const walls: Wall[] = [{ row: 2, col: 4, orientation: 'h' }];
    const state = makeState({ p0: [4, 4], p1: [3, 4], current: 0, walls });
    const legal = getValidPawnMoves(state, 0).map((p) => [p.row, p.col]);
    expect(legal).toEqual(expect.arrayContaining([[3, 3]]));

    const upLeft = decodeAction(4, state);
    const upRight = decodeAction(5, state);
    if (upLeft?.kind === 'pawn') expect([upLeft.to.row, upLeft.to.col]).toEqual([3, 3]);
    if (upRight?.kind === 'pawn') expect([upRight.to.row, upRight.to.col]).toEqual([3, 5]);
  });

  it('decodes wall actions to the same anchor and orientation', () => {
    const state = makeState({ current: 0 });

    const h = decodeAction(H_WALL_OFFSET + 2 * FENCE_GRID + 4, state);
    expect(h?.kind).toBe('wall');
    if (h?.kind === 'wall') expect(h.wall).toEqual({ row: 2, col: 4, orientation: 'h' });

    const v = decodeAction(V_WALL_OFFSET + 5 * FENCE_GRID + 3, state);
    expect(v?.kind).toBe('wall');
    if (v?.kind === 'wall') expect(v.wall).toEqual({ row: 5, col: 3, orientation: 'v' });
  });

  it('returns null for no-move, pass and out-of-range actions', () => {
    const state = makeState({ current: 0 });
    expect(decodeAction(-1, state)).toBeNull();
    expect(decodeAction(PASS_ACTION, state)).toBeNull();
    expect(decodeAction(PASS_ACTION + 1, state)).toBeNull();
    expect(decodeAction(1.5, state)).toBeNull();
  });

  it('refuses a wall when the player has none left', () => {
    const state = makeState({ p0Walls: 0, current: 0 });
    expect(decodeAction(H_WALL_OFFSET, state)).toBeNull();
  });

  it('refuses a wall this engine considers illegal', () => {
    // Duplicate placement: the app engine rejects it, so the decoder has to as well, since
    // the app engine is what will apply the move.
    const walls: Wall[] = [{ row: 3, col: 3, orientation: 'h' }];
    const state = makeState({ current: 0, walls });
    const action = H_WALL_OFFSET + 3 * FENCE_GRID + 3;
    expect(isValidWallPlacement(state, walls[0])).toBe(false);
    expect(decodeAction(action, state)).toBeNull();
  });

  it('only ever returns moves the app engine calls legal', () => {
    const state = makeState({ p0: [4, 4], p1: [3, 4], current: 0 });
    const legal = new Set(getValidPawnMoves(state, 0).map((p) => `${p.row},${p.col}`));
    for (let action = 0; action < NUM_MOVE_ACTIONS; action++) {
      const move = decodeAction(action, state);
      if (move?.kind === 'pawn') {
        expect(legal.has(`${move.to.row},${move.to.col}`)).toBe(true);
      }
    }
  });
});

describe('budgetFor', () => {
  it('aims for the target when the device is fast enough', () => {
    const budget = budgetFor(100_000);
    expect(budget.totalIterations).toBe(MCTS_BUDGET.targetIterations);
  });

  it('trims the budget to fit the time cap on a slow device', () => {
    // 500 iterations/sec against a 2.5s cap affords 1250, below the target.
    const budget = budgetFor(500);
    expect(budget.totalIterations).toBeLessThan(MCTS_BUDGET.targetIterations);
    expect(budget.totalIterations).toBeGreaterThanOrEqual(MCTS_BUDGET.minIterations);
  });

  it('never drops below the floor, however slow the device', () => {
    expect(budgetFor(1).totalIterations).toBe(MCTS_BUDGET.minIterations);
  });

  it('splits the total across workers', () => {
    const budget = budgetFor(100_000, 4);
    expect(budget.maxIters * 4).toBeGreaterThanOrEqual(budget.totalIterations);
  });
});

describe('blendSpeed', () => {
  it('moves toward the new sample without jumping to it', () => {
    const blended = blendSpeed(1000, 2000, 1000); // sample is 2000/s
    expect(blended).toBeGreaterThan(1000);
    expect(blended).toBeLessThan(2000);
  });

  it('takes the first measurement as-is', () => {
    // Blending the first sample with a hardcoded guess would carry that guess into every
    // later budget on this device.
    expect(blendSpeed(null, 2000, 1000)).toBe(2000);
  });

  it('ignores degenerate samples', () => {
    expect(blendSpeed(1234, 0, 500)).toBe(1234);
    expect(blendSpeed(1234, 100, 0)).toBe(1234);
    expect(blendSpeed(null, 0, 500)).toBeNull();
  });
});
