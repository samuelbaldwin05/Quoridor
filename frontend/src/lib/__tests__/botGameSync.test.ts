import { describe, expect, it, vi, beforeEach } from 'vitest';

// botGameSync talks to the backend (apiFetch) and local history (gameStorage);
// mock both so the sync/persist logic can be tested in isolation (node env).
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/gameStorage', () => ({
  listUnsyncedGames: vi.fn(),
  localGameMode: (g: { difficulty?: string }) => (g.difficulty != null ? 'vs_ai' : 'pass_and_play'),
  markGameSynced: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import { listUnsyncedGames, markGameSynced, type SavedGame } from '@/lib/gameStorage';
import { syncBotGame, syncPendingBotGames } from '@/lib/botGameSync';

const mockApiFetch = vi.mocked(apiFetch);
const mockList = vi.mocked(listUnsyncedGames);
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
      mode: 'vs_ai',
      ai_difficulty: 'bot1',
      winner_index: 0,
      move_history: ['e2'],
    });
    expect(mockMarkSynced).toHaveBeenCalledWith('game_1');
  });

  it('uploads a pass-and-play game, which has no bot to name', async () => {
    await syncBotGame(botGame({ difficulty: undefined, opponentLabel: 'Pass & Play' }));

    const [, init] = mockApiFetch.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      mode: 'pass_and_play',
      ai_difficulty: null,
    });
  });

  it('uploads an unfinished game rather than dropping it', async () => {
    // A game nobody won still happened, and recording it as a loss would be a lie. The
    // backend takes a null winner_index and reads it back as "unfinished".
    await syncBotGame(botGame({ winner: null }));

    const [, init] = mockApiFetch.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ winner_index: null });
  });

  it('skips an online game, which the server already recorded as it was played', async () => {
    await syncBotGame(botGame({ serverGameId: 'srv-1' }));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it('skips a save with no moves in it', async () => {
    await syncBotGame(botGame({ moves: [] }));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not mark synced when the upload throws', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('API 500'));
    await expect(syncBotGame(botGame())).rejects.toThrow();
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });
});

describe('syncPendingBotGames', () => {
  it('uploads every unsynced local game', async () => {
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
