import { describe, expect, it, vi, beforeEach } from 'vitest';

// botGameSync talks to the backend (apiFetch) and local history (gameStorage);
// mock both so the sync/persist logic can be tested in isolation (node env).
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/gameStorage', () => ({
  listUnsyncedBotGames: vi.fn(),
  markGameSynced: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import { listUnsyncedBotGames, markGameSynced, type SavedGame } from '@/lib/gameStorage';
import { syncBotGame, syncPendingBotGames } from '@/lib/botGameSync';

const mockApiFetch = vi.mocked(apiFetch);
const mockList = vi.mocked(listUnsyncedBotGames);
const mockMarkSynced = vi.mocked(markGameSynced);

function botGame(overrides?: Partial<SavedGame>): SavedGame {
  return {
    id: 'game_1',
    date: 0,
    moves: [{ move: { kind: 'pawn', to: { row: 7, col: 4 } }, playerIndex: 0, timestamp: 0 }],
    winner: 0,
    opponentLabel: 'Medium Bot',
    userRole: 0,
    difficulty: 'bot1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncBotGame', () => {
  it('posts a bot game (serialized moves) and marks it synced', async () => {
    await syncBotGame(botGame());

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/games/bot');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({
      client_game_id: 'game_1',
      ai_difficulty: 'bot1',
      winner_index: 0,
      move_history: ['e2'],
    });
    expect(mockMarkSynced).toHaveBeenCalledWith('game_1');
  });

  it('skips a save with no difficulty (not a bot game)', async () => {
    await syncBotGame(botGame({ difficulty: undefined }));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it('skips an unfinished save (winner is null)', async () => {
    await syncBotGame(botGame({ winner: null }));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not mark synced when the upload throws', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('API 500'));
    await expect(syncBotGame(botGame())).rejects.toThrow();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });
});

describe('syncPendingBotGames', () => {
  it('uploads every unsynced bot game', async () => {
    mockList.mockReturnValue([botGame({ id: 'a' }), botGame({ id: 'b' })]);
    await syncPendingBotGames();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenCalledWith('a');
    expect(mockMarkSynced).toHaveBeenCalledWith('b');
  });

  it('continues past a failed upload and still processes the rest', async () => {
    mockList.mockReturnValue([botGame({ id: 'a' }), botGame({ id: 'b' })]);
    mockApiFetch.mockRejectedValueOnce(new Error('boom')); // first upload fails
    await syncPendingBotGames();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenCalledTimes(1);
    expect(mockMarkSynced).toHaveBeenCalledWith('b');
  });

  it('does nothing when there is no unsynced history', async () => {
    mockList.mockReturnValue([]);
    await syncPendingBotGames();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
