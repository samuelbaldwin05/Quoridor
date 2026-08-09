-- Bot (vs-AI) game history persistence.
--
-- Single-player bot games are low-stakes and HISTORY-ONLY: they never touch Elo,
-- ranked stats, leaderboards, or games_played, and their result + move history are
-- accepted as client-reported (there is no opponent and nothing at stake, so no
-- server-side move validation, unlike ranked games). This migration adds the two
-- columns the backend record-bot-game endpoint writes.
--
-- No insert policy is added: bot games are inserted by the backend with the SERVICE
-- ROLE, which bypasses RLS -- the same path the finalization RPCs use after 009
-- removed the open games insert policy. Owners can already read their own bot games
-- via the existing "games_participants_read" policy (player1_id = auth.uid(); the
-- bot is player2 = NULL).

-- ── ai_difficulty ──────────────────────────────────────────────────────────────
-- The bot level the game was played against. Matches the frontend Settings.difficulty
-- union ('bot0'|'bot1'|'bot2'|'extreme'). Nullable: only vs_ai rows set it; every
-- other mode leaves it NULL (a NULL passes the CHECK, which only rejects a FALSE).
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS ai_difficulty text
        CHECK (ai_difficulty IN ('bot0', 'bot1', 'bot2', 'extreme'));

-- ── client_game_id ───────────────────────────────────────────────────────────
-- Stable client-supplied id for a saved bot game (the local SavedGame id). It makes
-- the record-bot-game write idempotent, so the one-time login backfill can re-send
-- without creating duplicates. Nullable: only vs_ai rows set it.
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS client_game_id text;

-- One row per (player, client id). Partial so it applies only to bot rows that carry
-- a client id and never constrains existing online/ranked rows (all NULL there).
CREATE UNIQUE INDEX IF NOT EXISTS games_player_client_game_id_key
    ON public.games (player1_id, client_game_id)
    WHERE client_game_id IS NOT NULL;
