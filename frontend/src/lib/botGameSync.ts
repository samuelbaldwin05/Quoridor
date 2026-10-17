import { serializeMove } from '@/engine/notation';
import { apiFetch } from './api';
import {
  listUnsyncedGames,
  localGameMode,
  markGameSynced,
  type BotDifficulty,
  type SavedGame,
} from './gameStorage';

// Request body for POST /games/bot, mirroring the backend BotGameCreate schema.
interface LocalGameCreate {
  client_game_id: string;
  mode: 'vs_ai' | 'pass_and_play';
  ai_difficulty: BotDifficulty | null;
  winner_index: 0 | 1 | null;
  move_history: string[];
}

// Response from POST /games/bot, mirroring the backend BotGameRead schema.
interface LocalGameRead {
  id: string;
  client_game_id: string;
  mode: 'vs_ai' | 'pass_and_play';
  ai_difficulty: BotDifficulty | null;
  winner_index: number | null;
  status: string;
  created: boolean;
}

/**
 * Persist one locally saved game to the backend (history only), then mark it synced so the
 * backfill never re-uploads it.
 *
 * Covers bot and pass-and-play games, finished or abandoned: a game that never reached the
 * backend exists in exactly one browser, and clearing site data is the end of it. Online
 * games are skipped, since the server recorded those as they were played, and so is a game
 * with no moves in it. The backend is idempotent on client_game_id, so a re-send is
 * harmless.
 */
export async function syncBotGame(game: SavedGame): Promise<void> {
  if (game.serverGameId != null || game.moves.length === 0) return;
  const mode = localGameMode(game);
  const body: LocalGameCreate = {
    client_game_id: game.id,
    mode,
    ai_difficulty: mode === 'vs_ai' ? (game.difficulty ?? null) : null,
    winner_index: game.winner,
    move_history: game.moves.map((sm) => serializeMove(sm.move)),
  };
  await apiFetch<LocalGameRead>('/games/bot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  markGameSynced(game.id);
}

// One-time backfill: upload every local game still sitting unsynced in this browser.
// Called once per authenticated session. Failures are swallowed per game so one bad
// upload doesn't block the rest; anything left unsynced retries on the next login.
export async function syncPendingBotGames(): Promise<void> {
  for (const game of listUnsyncedGames()) {
    try {
      await syncBotGame(game);
    } catch {
      // leave unsynced; retried on the next login
    }
  }
}
