import { describe, expect, it, vi, afterEach } from 'vitest';
import { clocksFrom, toStoredMoves, type GameSnapshot } from '@/lib/onlineGameSnapshot';

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    status: 'playing',
    player1_id: 'p1',
    player2_id: 'p2',
    player1_name: 'Alice',
    player2_name: 'Bob',
    time_control: 300,
    move_history: [],
    winner_index: null,
    time_used_p1: 0,
    time_used_p2: 0,
    last_move_at: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('toStoredMoves', () => {
  it('alternates the player index, player1 first', () => {
    const moves = toStoredMoves(['e2', 'e8', 'e3v']);
    expect(moves.map((m) => m.playerIndex)).toEqual([0, 1, 0]);
    expect(moves[0]!.move).toEqual({ kind: 'pawn', to: { row: 7, col: 4 } });
    expect(moves[2]!.move.kind).toBe('wall');
  });
});

describe('clocksFrom', () => {
  it('leaves both clocks full before the first move', () => {
    // Clocks are held until the game is under way, so a long wait costs nobody time.
    expect(clocksFrom(snapshot({ last_move_at: '2020-01-01T00:00:00Z' }), 300)).toEqual([300, 300]);
  });

  it('deducts what each player has spent', () => {
    const s = snapshot({ move_history: ['e2', 'e8'], time_used_p1: 40, time_used_p2: 25 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    s.last_move_at = '2026-01-01T00:00:00Z';
    expect(clocksFrom(s, 300)).toEqual([260, 275]);
  });

  it('also charges the player on move for the turn they still owe', () => {
    // Two moves played, so it is player1's turn again and their turn has run 30s.
    const s = snapshot({
      move_history: ['e2', 'e8'],
      time_used_p1: 40,
      time_used_p2: 25,
      last_move_at: '2026-01-01T00:00:00Z',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
    expect(clocksFrom(s, 300)).toEqual([230, 275]);
  });

  it('floors at zero rather than going negative', () => {
    const s = snapshot({
      move_history: ['e2'],
      time_used_p1: 10,
      time_used_p2: 299,
      last_move_at: '2026-01-01T00:00:00Z',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    expect(clocksFrom(s, 300)).toEqual([290, 0]);
  });
});
