import { botGameLabel } from '@/lib/botTiers';
import { gameOutcome, type GameOutcome, type SavedGame } from '@/lib/gameStorage';
import type { Settings } from '@/lib/schemas/settingsSchemas';

/** One row of GET /api/users/{id}/games: an online game as the backend recorded it. */
export interface ServerGameSummary {
  id: string;
  mode: 'pass_and_play' | 'vs_ai' | 'ranked' | 'casual';
  time_control: number | null;
  opponent_name: string | null;
  result: 'win' | 'loss';
  elo_change: number | null;
  move_count: number;
  completed_at: string | null;
}

/** One row of GET /games/bot: a local game as the backend recorded it, for the caller only. */
export interface ServerBotGameSummary {
  id: string;
  client_game_id: string;
  mode: 'vs_ai' | 'pass_and_play';
  ai_difficulty: Settings['difficulty'] | null;
  result: 'win' | 'loss' | 'unfinished';
  move_count: number;
  completed_at: string | null;
}

/**
 * A row in the history list. Online and bot games both come from the backend, so they are
 * there on any device; pass-and-play games only ever existed on this one. `id` is what the
 * viewer should be opened with, which is the local save's id whenever this browser still
 * holds the game and the server's id otherwise.
 */
export interface HistoryEntry {
  id: string;
  date: number;
  outcome: GameOutcome;
  opponentLabel: string;
  isBot: boolean;
  eloChange: number | null;
  casual: boolean;
}

/**
 * Build the history list from what the server has and what this browser remembers.
 *
 * Its own module rather than a helper inside the page, because the two dedupe rules below are
 * the whole reason this is not a concatenation and both are invisible until a game shows up
 * twice.
 */
export function mergeHistory(
  serverGames: ServerGameSummary[] | null,
  serverBotGames: ServerBotGameSummary[] | null,
  localSaves: Omit<SavedGame, 'moves'>[],
): HistoryEntry[] {
  // A local copy of an online game the server also has would otherwise appear twice. Saves
  // written before online games carried a server id have nothing to match on, so they can
  // still double up until they age out of the fifty the browser keeps.
  const hideLocalOnline = serverGames !== null;
  const localIds = new Set(localSaves.map((g) => g.id));

  const localEntries: HistoryEntry[] = localSaves
    .filter((g) => !(hideLocalOnline && g.serverGameId))
    .map((g) => ({
      id: g.id,
      date: g.date,
      outcome: gameOutcome(g),
      opponentLabel: g.opponentLabel ?? 'Bot',
      isBot: g.difficulty != null,
      eloChange: null,
      casual: false,
    }));

  const serverEntries: HistoryEntry[] = (serverGames ?? []).map((g) => ({
    id: g.id,
    date: g.completed_at ? new Date(g.completed_at).getTime() : 0,
    outcome: g.result,
    opponentLabel: g.opponent_name ?? 'Opponent',
    isBot: false,
    eloChange: g.elo_change,
    casual: g.mode === 'casual',
  }));

  // The server's copy of a local game this browser still holds is the same game, and the
  // local save is the better one to open: it is already there, where the server copy costs a
  // fetch. client_game_id is the local save's own id, which is what makes the two matchable.
  const botEntries: HistoryEntry[] = (serverBotGames ?? [])
    .filter((g) => !localIds.has(g.client_game_id))
    .map((g) => ({
      id: g.id,
      date: g.completed_at ? new Date(g.completed_at).getTime() : 0,
      outcome: g.result,
      opponentLabel: g.mode === 'pass_and_play' ? 'Pass & Play' : botGameLabel(g.ai_difficulty),
      isBot: g.mode === 'vs_ai',
      eloChange: null,
      casual: false,
    }));

  return [...serverEntries, ...botEntries, ...localEntries].sort((a, b) => b.date - a.date);
}
