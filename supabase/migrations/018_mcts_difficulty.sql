-- Allow 'mcts' as a bot level on vs_ai game history.
--
-- The new Insane tier plays through the C++ MCTS engine (backend by default, the WASM build
-- in the browser as a fallback). Its games are persisted the same way every other bot game
-- is: history-only, no Elo, client-reported (see DECISIONS).
--
-- 011 created games.ai_difficulty with an inline CHECK listing the four levels that existed
-- then, so the constraint has to be replaced rather than extended. Without this, every
-- finished game against the new tier fails to sync with a constraint violation, and the
-- failure surfaces on the client's backfill rather than during play.
--
-- The constraint name is the one Postgres generated for the inline CHECK in 011
-- (games_ai_difficulty_check). IF EXISTS keeps this idempotent and safe on a database where
-- 011 was applied before the column existed.

ALTER TABLE public.games
    DROP CONSTRAINT IF EXISTS games_ai_difficulty_check;

ALTER TABLE public.games
    ADD CONSTRAINT games_ai_difficulty_check
        CHECK (ai_difficulty IN ('bot0', 'bot1', 'bot2', 'extreme', 'mcts'));
