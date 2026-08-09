import { serializeMove } from '@/engine/notation';
import { apiFetch } from './api';
import {
  listUnsyncedBotGames,
  markGameSynced,
  type BotDifficulty,
  type SavedGame,
} from './gameStorage';

// Request body for POST /games/bot, mirroring the backend BotGameCreate schema.
interface BotGameCreate {
  client_game_id: string;
  ai_difficulty: BotDifficulty;
  winner_index: 0 | 1;
  move_history: string[];
}

// Response from POST /games/bot, mirroring the backend BotGameRead schema.
interface BotGameRead {
  id: string;
  client_game_id: string;
  ai_difficulty: BotDifficulty;
  winner_index: number;
  status: string;
  created: boolean;
}

// Persist one finished bot game to the backend (history only), then mark it synced
// locally so the backfill never re-uploads it. No-op for non-bot or unfinished
// saves. The backend is idempotent on client_game_id, so a re-send is harmless.
export async function syncBotGame(game: SavedGame): Promise<void> {
  if (game.difficulty == null || game.winner == null) return;
  const body: BotGameCreate = {
    client_game_id: game.id,
    ai_difficulty: game.difficulty,
    winner_index: game.winner,
    move_history: game.moves.map((sm) => serializeMove(sm.move)),
  };
  await apiFetch<BotGameRead>('/games/bot', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  markGameSynced(game.id);
}

// One-time backfill: upload every bot game still sitting unsynced in local history.
// Called once per authenticated session. Failures are swallowed per game so one bad
// upload doesn't block the rest; anything left unsynced retries on the next login.
export async function syncPendingBotGames(): Promise<void> {
  for (const game of listUnsyncedBotGames()) {
    try {
      await syncBotGame(game);
    } catch {
      // leave unsynced; retried on the next login
    }
  }
}
