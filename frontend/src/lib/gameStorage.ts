import type { StoredMove } from '@/engine/gameTypes';

export interface SavedGame {
  id: string;
  date: number;
  moves: StoredMove[];
  winner: 0 | 1 | null;
  opponentLabel: string;
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

export function saveGame(moves: StoredMove[], winner: 0 | 1 | null, opponentLabel = 'Bot'): string {
  const id = `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const game: SavedGame = { id, date: Date.now(), moves, winner, opponentLabel };
  const existing = loadAll();
  saveAll([game, ...existing].slice(0, 50)); // keep last 50 games
  return id;
}

export function loadGame(id: string): SavedGame | null {
  return loadAll().find((g) => g.id === id) ?? null;
}

export function listGames(): Omit<SavedGame, 'moves'>[] {
  return loadAll().map(({ id, date, winner, opponentLabel }) => ({
    id,
    date,
    winner,
    opponentLabel,
  }));
}
