import { describe, expect, it } from 'vitest';
import { applyMove, createInitialState } from '../gameEngine';
import { parseMove } from '../notation';
import type { GameState } from '../gameTypes';

function playingState(): GameState {
  return { ...createInitialState(), status: 'playing' };
}

function applyHistory(moves: string[]): GameState {
  let state = playingState();
  for (const text of moves) {
    const result = applyMove(state, parseMove(text));
    if (!result.valid) throw new Error(`illegal move in setup: ${text}`);
    state = result.nextState;
  }
  return state;
}

// ── createInitialState ────────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('starts in idle status', () => {
    expect(createInitialState().status).toBe('idle');
  });
  it('p0 starts at (8,4) with goalRow 0', () => {
    const s = createInitialState();
    expect(s.players[0].position).toEqual({ row: 8, col: 4 });
    expect(s.players[0].goalRow).toBe(0);
  });
  it('p1 starts at (0,4) with goalRow 8', () => {
    const s = createInitialState();
    expect(s.players[1].position).toEqual({ row: 0, col: 4 });
    expect(s.players[1].goalRow).toBe(8);
  });
  it('both players start with 10 walls', () => {
    const s = createInitialState();
    expect(s.players[0].wallsRemaining).toBe(10);
    expect(s.players[1].wallsRemaining).toBe(10);
  });
  it('no walls on board at start', () => {
    expect(createInitialState().walls).toHaveLength(0);
  });
  it('p0 moves first', () => {
    expect(createInitialState().currentPlayerIndex).toBe(0);
  });
  it('no winner at start', () => {
    expect(createInitialState().winner).toBeNull();
  });
});

// ── applyMove — reject when not playing ──────────────────────────────────────

describe('applyMove — non-playing states', () => {
  it('rejects moves when game is idle', () => {
    const result = applyMove(createInitialState(), parseMove('e2'));
    expect(result.valid).toBe(false);
    expect(result.nextState.status).toBe('idle');
  });

  it('rejects moves when game is finished', () => {
    const finished = { ...playingState(), status: 'finished' as const };
    const result = applyMove(finished, parseMove('e2'));
    expect(result.valid).toBe(false);
  });
});

// ── applyMove — pawn moves ────────────────────────────────────────────────────

describe('applyMove — valid pawn moves', () => {
  it('p0 forward move e2 is valid', () => {
    const result = applyMove(playingState(), parseMove('e2'));
    expect(result.valid).toBe(true);
  });

  it('p0 position updates after valid move', () => {
    const result = applyMove(playingState(), parseMove('e2'));
    expect(result.nextState.players[0].position).toEqual({ row: 7, col: 4 });
  });

  it('turn switches to p1 after p0 moves', () => {
    const result = applyMove(playingState(), parseMove('e2'));
    expect(result.nextState.currentPlayerIndex).toBe(1);
  });

  it('turn switches back to p0 after p1 moves', () => {
    const state = applyHistory(['e2']);
    const result = applyMove(state, parseMove('e8'));
    expect(result.nextState.currentPlayerIndex).toBe(0);
  });

  it('p0 sideways move d1 is valid', () => {
    const result = applyMove(playingState(), parseMove('d1'));
    expect(result.valid).toBe(true);
    expect(result.nextState.players[0].position).toEqual({ row: 8, col: 3 });
  });

  it('p0 cannot move two squares forward', () => {
    const result = applyMove(playingState(), parseMove('e3'));
    expect(result.valid).toBe(false);
  });

  it('p0 cannot move diagonally without a jump', () => {
    const result = applyMove(playingState(), parseMove('d2'));
    expect(result.valid).toBe(false);
  });

  it('p0 cannot stay in place', () => {
    const result = applyMove(playingState(), parseMove('e1'));
    expect(result.valid).toBe(false);
  });
});

// ── applyMove — wall moves ────────────────────────────────────────────────────

describe('applyMove — valid wall placement', () => {
  it('p0 can place a wall', () => {
    const result = applyMove(playingState(), parseMove('e7h'));
    expect(result.valid).toBe(true);
  });

  it('wall appears in nextState.walls', () => {
    const result = applyMove(playingState(), parseMove('e7h'));
    expect(result.nextState.walls).toHaveLength(1);
    expect(result.nextState.walls[0]).toEqual({ row: 2, col: 4, orientation: 'h' });
  });

  it("p0's wallsRemaining decrements by 1", () => {
    const result = applyMove(playingState(), parseMove('e7h'));
    expect(result.nextState.players[0].wallsRemaining).toBe(9);
  });

  it("p1's wallsRemaining is unchanged after p0 places wall", () => {
    const result = applyMove(playingState(), parseMove('e7h'));
    expect(result.nextState.players[1].wallsRemaining).toBe(10);
  });

  it('turn switches after wall placement', () => {
    const result = applyMove(playingState(), parseMove('e7h'));
    expect(result.nextState.currentPlayerIndex).toBe(1);
  });

  it('rejects wall when player has 0 walls remaining', () => {
    const noWalls = {
      ...playingState(),
      players: [
        { position: { row: 8, col: 4 }, wallsRemaining: 0, goalRow: 0 },
        playingState().players[1],
      ] as GameState['players'],
    };
    const result = applyMove(noWalls, parseMove('e7h'));
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate wall placement', () => {
    const state = applyHistory(['e7h', 'e8']); // p0 places wall, p1 moves
    const result = applyMove(state, parseMove('e7h'));
    expect(result.valid).toBe(false);
  });

  it('rejects out-of-bounds wall (col 9)', () => {
    // i2v has col=8 which is out of bounds for walls (must be 0-7)
    const result = applyMove(playingState(), parseMove('i2v'));
    expect(result.valid).toBe(false);
  });
});

// ── win detection ─────────────────────────────────────────────────────────────

describe('win detection', () => {
  it('p0 wins when reaching row 0', () => {
    // Fast p0 win: march straight, p1 wanders sideways
    const state = applyHistory([
      'e2',
      'd9',
      'e3',
      'e9',
      'e4',
      'd9',
      'e5',
      'e9',
      'e6',
      'd9',
      'e7',
      'e9',
      'e8',
      'd9',
      'e9',
    ]);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(0);
  });

  it('p1 wins when reaching row 8', () => {
    // p1 marches straight down column 4; p0 shuffles harmlessly in columns 2-3,
    // never touching column 4, so p1's path and the goal square stay clear.
    const state = applyHistory([
      'd1',
      'e8',
      'c1',
      'e7',
      'd1',
      'e6',
      'c1',
      'e5',
      'd1',
      'e4',
      'c1',
      'e3',
      'd1',
      'e2',
      'c1',
      'e1',
    ]);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(1);
  });

  it('game stays playing before goal row is reached', () => {
    const state = applyHistory(['e2', 'e8']);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });

  it('no further moves accepted after game is finished', () => {
    const finished = applyHistory([
      'e2',
      'd9',
      'e3',
      'e9',
      'e4',
      'd9',
      'e5',
      'e9',
      'e6',
      'd9',
      'e7',
      'e9',
      'e8',
      'd9',
      'e9',
    ]);
    expect(finished.status).toBe('finished');
    const result = applyMove(finished, parseMove('d9'));
    expect(result.valid).toBe(false);
  });
});

// ── accumulated wall state ────────────────────────────────────────────────────

describe('accumulated game state', () => {
  it('multiple walls accumulate correctly', () => {
    const state = applyHistory(['e7h', 'e8', 'e5h', 'e7']);
    expect(state.walls).toHaveLength(2);
  });

  it('10 walls placed exhausts p0 supply', () => {
    // p0 places 10 legal walls on the left (cols 0+2, rows 0-4), leaving a clear
    // col 4-7 corridor so every placement passes the path check; p1 oscillates d9/e9.
    const wallMoves = [
      'a9h',
      'd9',
      'c9h',
      'e9',
      'a8h',
      'd9',
      'c8h',
      'e9',
      'a7h',
      'd9',
      'c7h',
      'e9',
      'a6h',
      'd9',
      'c6h',
      'e9',
      'a5h',
      'd9',
      'c5h',
      'e9',
    ];
    const state = applyHistory(wallMoves);
    expect(state.players[0].wallsRemaining).toBe(0);
    // Now p0 cannot place another wall
    const noWallResult = applyMove(state, parseMove('e3h'));
    expect(noWallResult.valid).toBe(false);
  });

  it('p0 state is unchanged when p1 places a wall', () => {
    const state = applyHistory(['e2', 'e5h']); // p0 moves, p1 places wall
    expect(state.players[0].wallsRemaining).toBe(10); // p0 unchanged
    expect(state.players[1].wallsRemaining).toBe(9); // p1 used one
  });
});
