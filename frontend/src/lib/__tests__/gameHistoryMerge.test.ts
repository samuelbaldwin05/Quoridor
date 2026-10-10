import { describe, expect, it } from 'vitest';
import { mergeHistory } from '../gameHistoryMerge';
import type { SavedGame } from '@/lib/gameStorage';

/**
 * History comes from three places that overlap: the ranked list, the caller's bot games, and
 * whatever this browser saved locally. Bot games used to be written to the backend and never
 * read back, so they lived only in local storage and went away with the site data.
 */

function localSave(over: Partial<SavedGame> = {}): Omit<SavedGame, 'moves'> {
  return {
    id: 'game_1700000000_abcde',
    date: 1_700_000_000_000,
    winner: 0,
    opponentLabel: 'Medium Bot',
    userRole: 0,
    difficulty: 'bot2',
    ...over,
  };
}

function botRow(over = {}) {
  return {
    id: 'server-uuid-1',
    client_game_id: 'game_1700000000_abcde',
    ai_difficulty: 'bot2' as const,
    result: 'win' as const,
    move_count: 12,
    completed_at: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('mergeHistory', () => {
  it('shows a bot game the server has and this browser does not', () => {
    const [entry, ...rest] = mergeHistory(null, [botRow()], []);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ id: 'server-uuid-1', isBot: true, opponentLabel: 'Medium Bot' });
  });

  it('keeps one row when the same bot game is both local and on the server', () => {
    const merged = mergeHistory(null, [botRow()], [localSave()]);
    expect(merged).toHaveLength(1);
    // The local save wins: it is already in hand, where the server copy costs a fetch.
    expect(merged[0]!.id).toBe('game_1700000000_abcde');
  });

  it('matches the two copies on client_game_id, not on the server id', () => {
    const merged = mergeHistory(null, [botRow({ id: 'a-different-server-id' })], [localSave()]);
    expect(merged).toHaveLength(1);
  });

  it('keeps both when they are genuinely different games', () => {
    const merged = mergeHistory(null, [botRow({ client_game_id: 'game_other' })], [localSave()]);
    expect(merged).toHaveLength(2);
  });

  it('names the tier on a server bot game, including the retired one', () => {
    const [entry] = mergeHistory(null, [botRow({ ai_difficulty: 'bot0' })], []);
    expect(entry!.opponentLabel).toBe('Beginner Bot (retired)');
  });

  it('still hides a local online save once the server list has arrived', () => {
    const local = localSave({ id: 'local-online', serverGameId: 'srv-1', difficulty: undefined });
    expect(mergeHistory([], null, [local])).toEqual([]);
    // With no server list there is nothing to be a duplicate of, so the save stands.
    expect(mergeHistory(null, null, [local])).toHaveLength(1);
  });

  it('orders every source together, newest first', () => {
    const merged = mergeHistory(
      [
        {
          id: 'ranked-1',
          mode: 'ranked',
          time_control: 300,
          opponent_name: 'Bob',
          result: 'loss',
          elo_change: -8,
          move_count: 40,
          completed_at: '2026-07-03T00:00:00Z',
        },
      ],
      [botRow({ completed_at: '2026-07-02T00:00:00Z', client_game_id: 'game_other' })],
      [localSave({ id: 'local-1', date: Date.parse('2026-07-04T00:00:00Z') })],
    );
    expect(merged.map((e) => e.id)).toEqual(['local-1', 'ranked-1', 'server-uuid-1']);
  });
});
