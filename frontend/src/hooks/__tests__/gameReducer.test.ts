import { describe, expect, it, vi, beforeEach } from 'vitest';

// gameReducer persists finished games / settings via these modules — mock them
// so the reducer's pure state transitions can be tested in the node environment.
vi.mock('@/lib/gameStorage', () => ({
  saveGame: vi.fn(() => 'saved-game-id'),
}));
vi.mock('@/lib/settingsStorage', () => ({
  saveSettings: vi.fn(),
}));

import { saveGame } from '@/lib/gameStorage';
import { saveSettings } from '@/lib/settingsStorage';
import { SettingsSchema } from '@/lib/schemas/settingsSchemas';
import { gameReducer, createInitialFullState, type FullState } from '@/hooks/gameReducer';
import { parseMove } from '@/engine/notation';

function freshState(overrides?: Partial<ReturnType<typeof SettingsSchema.parse>>): FullState {
  const settings = SettingsSchema.parse(overrides ?? {});
  return createInitialFullState(settings);
}

function playing(overrides?: Partial<ReturnType<typeof SettingsSchema.parse>>): FullState {
  return gameReducer(freshState(overrides), { type: 'START_GAME' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createInitialFullState', () => {
  it('starts idle with a zero score and empty history', () => {
    const s = freshState();
    expect(s.game.status).toBe('idle');
    expect(s.score).toEqual({ player: 0, computer: 0 });
    expect(s.moveHistory).toEqual([]);
    expect(s.lastSavedGameId).toBeNull();
  });
});

describe('START_GAME / NEW_GAME', () => {
  it('START_GAME moves to playing and clears history', () => {
    const s = playing();
    expect(s.game.status).toBe('playing');
    expect(s.moveHistory).toEqual([]);
    expect(s.lastSavedGameId).toBeNull();
  });

  it('NEW_GAME resets the board to a fresh playing state', () => {
    let s = playing();
    s = gameReducer(s, { type: 'APPLY_MOVE', move: parseMove('e2') });
    s = gameReducer(s, { type: 'NEW_GAME' });
    expect(s.game.status).toBe('playing');
    expect(s.moveHistory).toEqual([]);
    expect(s.game.players[0].position).toEqual({ row: 8, col: 4 });
  });
});

describe('APPLY_MOVE', () => {
  it('ignores moves when not playing', () => {
    const idle = freshState();
    const next = gameReducer(idle, { type: 'APPLY_MOVE', move: parseMove('e2') });
    expect(next).toBe(idle); // unchanged reference
  });

  it('applies a legal move and appends to history', () => {
    const s = gameReducer(playing(), { type: 'APPLY_MOVE', move: parseMove('e2') });
    expect(s.game.players[0].position).toEqual({ row: 7, col: 4 });
    expect(s.moveHistory).toHaveLength(1);
    expect(s.moveHistory[0]!.playerIndex).toBe(0);
  });

  it('surfaces an error message on an illegal move and does not advance', () => {
    const start = playing();
    const s = gameReducer(start, { type: 'APPLY_MOVE', move: parseMove('e3') }); // 2 squares
    expect(s.message).toEqual({ text: 'Invalid move!', kind: 'error' });
    expect(s.moveHistory).toHaveLength(0);
    expect(s.game.players[0].position).toEqual({ row: 8, col: 4 });
  });

  it('in vs-bot mode it is not player 0 turn after p0 moves, so a second APPLY_MOVE is ignored', () => {
    let s = gameReducer(playing({ gameMode: 'vs-bot' }), {
      type: 'APPLY_MOVE',
      move: parseMove('e2'),
    });
    expect(s.game.currentPlayerIndex).toBe(1);
    const before = s;
    s = gameReducer(s, { type: 'APPLY_MOVE', move: parseMove('e8') });
    expect(s).toBe(before); // p0 cannot move on p1's turn in vs-bot
  });

  it('pass-and-play lets either side move in turn', () => {
    let s = gameReducer(playing({ gameMode: 'pass-and-play' }), {
      type: 'APPLY_MOVE',
      move: parseMove('e2'),
    });
    s = gameReducer(s, { type: 'APPLY_MOVE', move: parseMove('e8') });
    expect(s.moveHistory).toHaveLength(2);
    expect(s.game.currentPlayerIndex).toBe(0);
  });

  it('records a win, bumps the player score, and saves the game', () => {
    let s = playing({ gameMode: 'pass-and-play' });
    // p0 marches up column 4 to row 0; p1 shuffles d9/e9 out of the way.
    const moves = [
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
    ];
    for (const m of moves) s = gameReducer(s, { type: 'APPLY_MOVE', move: parseMove(m) });
    expect(s.game.status).toBe('finished');
    expect(s.game.winner).toBe(0);
    expect(s.score.player).toBe(1);
    expect(s.message?.kind).toBe('success');
    expect(saveGame).toHaveBeenCalledTimes(1);
    expect(s.lastSavedGameId).toBe('saved-game-id');
  });
});

describe('RESIGN', () => {
  it('finishes the game as a loss, bumps computer score, and saves', () => {
    const s = gameReducer(playing(), { type: 'RESIGN' });
    expect(s.game.status).toBe('finished');
    expect(s.game.winner).toBe(1);
    expect(s.score.computer).toBe(1);
    expect(saveGame).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when not playing', () => {
    const idle = freshState();
    expect(gameReducer(idle, { type: 'RESIGN' })).toBe(idle);
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('tags a vs-bot save with the bot difficulty (for backend persistence)', () => {
    gameReducer(playing({ gameMode: 'vs-bot', difficulty: 'bot1' }), { type: 'RESIGN' });
    expect(saveGame).toHaveBeenCalledWith(expect.anything(), 1, expect.any(String), 0, 'bot1');
  });

  it('leaves difficulty undefined for a pass-and-play save (stays local-only)', () => {
    gameReducer(playing({ gameMode: 'pass-and-play' }), { type: 'RESIGN' });
    expect(saveGame).toHaveBeenCalledWith(expect.anything(), 1, expect.any(String), 0, undefined);
  });
});

describe('UPDATE_SETTINGS', () => {
  it('merges the patch and persists settings', () => {
    const s = gameReducer(freshState(), { type: 'UPDATE_SETTINGS', patch: { volume: 0.2 } });
    expect(s.settings.volume).toBe(0.2);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('resets the AI context only when difficulty changes', () => {
    const base = freshState({ difficulty: 'bot1' });
    const sameDiff = gameReducer(base, { type: 'UPDATE_SETTINGS', patch: { volume: 0.5 } });
    expect(sameDiff.aiContext).toBe(base.aiContext); // unchanged reference
    const changed = gameReducer(base, { type: 'UPDATE_SETTINGS', patch: { difficulty: 'bot2' } });
    expect(changed.aiContext).not.toBe(base.aiContext);
  });
});

describe('online + misc transitions', () => {
  it('APPLY_ONLINE_MOVE applies either player without turn gating', () => {
    let s = playing();
    s = gameReducer(s, { type: 'APPLY_ONLINE_MOVE', move: parseMove('e2'), playerIndex: 0 });
    s = gameReducer(s, { type: 'APPLY_ONLINE_MOVE', move: parseMove('e8'), playerIndex: 1 });
    expect(s.moveHistory).toHaveLength(2);
    expect(saveGame).not.toHaveBeenCalled(); // online games are saved server-side
  });

  it('RESIGN_ONLINE finishes with the given winner', () => {
    const s = gameReducer(playing(), { type: 'RESIGN_ONLINE', winner: 0 });
    expect(s.game.status).toBe('finished');
    expect(s.game.winner).toBe(0);
  });

  it('RESET_TO_IDLE returns the board to idle', () => {
    const s = gameReducer(playing(), { type: 'RESET_TO_IDLE' });
    expect(s.game.status).toBe('idle');
  });

  it('SHOW_MESSAGE / CLEAR_MESSAGE set and clear the banner', () => {
    let s = gameReducer(freshState(), { type: 'SHOW_MESSAGE', text: 'hi', kind: 'info' });
    expect(s.message).toEqual({ text: 'hi', kind: 'info' });
    s = gameReducer(s, { type: 'CLEAR_MESSAGE' });
    expect(s.message).toBeNull();
  });
});

describe('RESTORE_ONLINE_GAME', () => {
  it('adopts the server history over whatever the client had', () => {
    // A client that reloaded starts from nothing; the server's history is the game.
    const moves = ['e2', 'e8', 'e3'].map((n, i) => ({
      move: parseMove(n),
      playerIndex: (i % 2) as 0 | 1,
      timestamp: 0,
    }));
    const restored = gameReducer(freshState(), { type: 'RESTORE_ONLINE_GAME', moves });

    expect(restored.moveHistory).toHaveLength(3);
    expect(restored.game.status).toBe('playing');
    expect(restored.game.currentPlayerIndex).toBe(1);
    expect(restored.game.players[0].position).toEqual({ row: 6, col: 4 });
    expect(restored.game.players[1].position).toEqual({ row: 1, col: 4 });
  });

  it('comes back finished when the history already ends in a win', () => {
    const winning = [
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
    ];
    const moves = winning.map((n, i) => ({
      move: parseMove(n),
      playerIndex: (i % 2) as 0 | 1,
      timestamp: 0,
    }));
    const restored = gameReducer(freshState(), { type: 'RESTORE_ONLINE_GAME', moves });
    expect(restored.game.status).toBe('finished');
    expect(restored.game.winner).toBe(0);
  });
});
