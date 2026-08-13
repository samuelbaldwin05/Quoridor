import { describe, expect, it } from 'vitest';
import { makeBot1Move } from '../bots/bot1';
import { dijkstraDistance } from '../pathfinder';
import { applyMove } from '@/engine/gameEngine';
import type { GameState, Position, Wall } from '@/engine/gameTypes';

/**
 * bot1 is the Easy tier. The bar is "not a give-me", not "plays well": it has to notice a player
 * walking into the goal and make them go around, and it should not burn walls doing nothing.
 *
 * The bot is player 1 (starts row 0, goal row 8); the human is player 0 (starts row 8, goal 0).
 * `moveCount` is kept above BOT1_RANDOM_MOVES in every case so the random-opening branch cannot
 * fire and make these flaky.
 */

function state(overrides: {
  human?: Position;
  bot?: Position;
  humanWalls?: number;
  botWalls?: number;
  walls?: Wall[];
}): GameState {
  return {
    players: [
      {
        position: overrides.human ?? { row: 8, col: 4 },
        wallsRemaining: overrides.humanWalls ?? 10,
        goalRow: 0,
      },
      {
        position: overrides.bot ?? { row: 0, col: 4 },
        wallsRemaining: overrides.botWalls ?? 10,
        goalRow: 8,
      },
    ],
    walls: overrides.walls ?? [],
    currentPlayerIndex: 1,
    status: 'playing',
    winner: null,
  };
}

const settled = { moveCount: 9, previousPosition: null };

describe('bot1 blocks a player who is about to win', () => {
  it('spends a wall when the human is one move from the goal', () => {
    // The regression this exists for: the old gate was `opponent.row >= 6`, so it fired while
    // the human was still near their start and switched off exactly here.
    const s = state({ human: { row: 1, col: 4 } });
    const decision = makeBot1Move(s, 1, settled);

    expect(decision).not.toBeNull();
    expect(decision!.move.kind).toBe('wall');
  });

  it('picks a wall that actually costs the human distance', () => {
    const s = state({ human: { row: 1, col: 4 } });
    const before = dijkstraDistance(s, s.players[0].position, 0);

    const decision = makeBot1Move(s, 1, settled);
    expect(decision!.move.kind).toBe('wall');

    const after = applyMove(s, decision!.move);
    expect(after.valid).toBe(true);
    expect(dijkstraDistance(after.nextState, s.players[0].position, 0)).toBeGreaterThan(before);
  });

  it('blocks from either side of the board', () => {
    // Mirrored: bot1 plays player 0 (running to row 0) against an opponent one step from row 8.
    // A gate written in raw rows can only ever be right for one of the two orientations.
    const mirrored: GameState = {
      players: [
        { position: { row: 4, col: 0 }, wallsRemaining: 10, goalRow: 0 },
        { position: { row: 7, col: 4 }, wallsRemaining: 10, goalRow: 8 },
      ],
      walls: [],
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
    };
    const decision = makeBot1Move(mirrored, 0, settled);
    expect(decision!.move.kind).toBe('wall');

    const after = applyMove(mirrored, decision!.move);
    expect(after.valid).toBe(true);
    expect(dijkstraDistance(after.nextState, mirrored.players[1].position, 8)).toBeGreaterThan(1);
  });

  it('still moves when it has no walls left', () => {
    const s = state({ human: { row: 1, col: 4 }, botWalls: 0 });
    const decision = makeBot1Move(s, 1, settled);
    expect(decision!.move.kind).toBe('pawn');
  });

  it('takes its own win over blocking the opponent', () => {
    const s = state({ human: { row: 1, col: 4 }, bot: { row: 7, col: 0 } });
    const decision = makeBot1Move(s, 1, settled);
    expect(decision!.move).toEqual({ kind: 'pawn', to: { row: 8, col: 0 } });
  });
});

describe('bot1 wall discipline', () => {
  it('does not spend walls on a human still at their start', () => {
    // Eight moves from home, so nothing is urgent. A wall here is the old bug's signature.
    const s = state({ human: { row: 8, col: 4 } });
    const decision = makeBot1Move(s, 1, settled);
    expect(decision!.move.kind).toBe('pawn');
  });

  it('blocks somewhere on the route once the human is within three moves', () => {
    const s = state({ human: { row: 3, col: 4 } });
    const before = dijkstraDistance(s, s.players[0].position, 0);

    // Randomised choice, so assert the property rather than a specific wall: whatever it does,
    // over repeated tries it should be legal and, when it is a wall, cost the human something.
    for (let i = 0; i < 20; i++) {
      const decision = makeBot1Move(s, 1, settled);
      const result = applyMove(s, decision!.move);
      expect(result.valid).toBe(true);
      if (decision!.move.kind === 'wall') {
        expect(dijkstraDistance(result.nextState, s.players[0].position, 0)).toBeGreaterThan(
          before,
        );
      }
    }
  });

  it('never returns an illegal move from an awkward, half-walled position', () => {
    const walls: Wall[] = [
      { row: 1, col: 3, orientation: 'h' },
      { row: 2, col: 1, orientation: 'v' },
      { row: 5, col: 5, orientation: 'h' },
      { row: 6, col: 2, orientation: 'v' },
    ];
    const s = state({ human: { row: 2, col: 4 }, bot: { row: 5, col: 3 }, walls, botWalls: 2 });
    for (let i = 0; i < 25; i++) {
      const decision = makeBot1Move(s, 1, settled);
      expect(decision).not.toBeNull();
      expect(applyMove(s, decision!.move).valid).toBe(true);
    }
  });
});
