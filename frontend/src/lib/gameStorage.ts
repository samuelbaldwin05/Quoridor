import type { StoredMove } from '@/engine/gameTypes';

export interface SavedGame {
  id: string;
  date: number;
  moves: StoredMove[];
  winner: 0 | 1 | null;
  opponentLabel: string;
  // Which side the user played. Optional: pre-existing saves default to 0.
  userRole?: 0 | 1;
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
): string {
  const id = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const game: SavedGame = { id, date: Date.now(), moves, winner, opponentLabel, userRole };
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
