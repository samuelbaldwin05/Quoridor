import type { StoredMove } from '@/engine/gameTypes';
import type { Settings } from '@/lib/schemas/settingsSchemas';

// Bot level a vs-bot game was played against (frontend source of truth for the
// backend games.ai_difficulty column).
export type BotDifficulty = Settings['difficulty'];

export interface SavedGame {
  id: string;
  date: number;
  moves: StoredMove[];
  winner: 0 | 1 | null;
  opponentLabel: string;
  // Which side the user played. Optional: pre-existing saves default to 0.
  userRole?: 0 | 1;
  // Real [player1, player2] names for online-game replays (viewer may be a
  // non-participant, so both sides are shown by name rather than "You"/opponent).
  playerNames?: [string, string];
  // Set only for vs-bot games: the bot level played. Its presence marks a game as a
  // bot game, and it is sent as ai_difficulty when persisting to the backend.
  difficulty?: BotDifficulty;
  // Whether this bot game has been persisted to the backend. Undefined/false means
  // the login backfill still needs to upload it.
  synced?: boolean;
}

const STORAGE_KEY = 'quoridor_games';

function loadAll(): SavedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedGame[]) : [];
  } catch {
    return [];
  }
}

function saveAll(games: SavedGame[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function saveGame(
  moves: StoredMove[],
  winner: 0 | 1 | null,
  opponentLabel = 'Bot',
  userRole: 0 | 1 = 0,
  difficulty?: BotDifficulty,
): string {
  const id = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const game: SavedGame = { id, date: Date.now(), moves, winner, opponentLabel, userRole };
  if (difficulty) game.difficulty = difficulty; // vs-bot games only
  const existing = loadAll();
  saveAll([game, ...existing].slice(0, 50)); // keep last 50 games
  return id;
}

export function loadGame(id: string): SavedGame | null {
  return loadAll().find((g) => g.id === id) ?? null;
}

export function listGames(): Omit<SavedGame, 'moves'>[] {
  return loadAll().map(({ id, date, winner, opponentLabel, userRole }) => ({
    id,
    date,
    winner,
    opponentLabel,
    userRole,
  }));
}

export function didUserWin(game: Pick<SavedGame, 'winner' | 'userRole'>): boolean {
  if (game.winner === null) return false;
  return game.winner === (game.userRole ?? 0);
}

// Finished bot games saved locally but not yet persisted to the backend. Full
// records (moves included) so the caller can serialize and upload them.
export function listUnsyncedBotGames(): SavedGame[] {
  return loadAll().filter((g) => g.difficulty != null && g.winner != null && !g.synced);
}

// Mark a saved bot game as persisted so the login backfill never re-uploads it.
export function markGameSynced(id: string): void {
  const games = loadAll();
  const idx = games.findIndex((g) => g.id === id);
  if (idx === -1) return;
  games[idx] = { ...games[idx]!, synced: true };
  saveAll(games);
}
