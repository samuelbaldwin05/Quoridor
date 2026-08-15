-- Move the schema onto the 1000-base rating scale.
--
-- The rating system is re-denominated: base 500 -> 1000, spread doubled, bounds
-- 100/2500 -> 200/5000. The backend's expected-score divisor goes 400 -> 800 and its K
-- values double in the same change, so this is the identical rating system in new units.
-- No ranking changes, no prediction changes, every delta just reads about twice as large.
-- K additionally tapers from 128 to 64 over a player's first 20 ranked games, which needs
-- no schema support since it keys off users.games_played.
--
-- This migration carries only the durable schema half: the column default for new
-- signups, and the bounds inside submit_game_result. The one-time rescale of EXISTING
-- rows (users.elo, games.elo_change_*, matchmaking_queue, puzzles.estimated_elo) is run
-- by hand right after this deploys, since a single historical data edit is not something
-- every future db reset should replay.

ALTER TABLE public.users ALTER COLUMN elo SET DEFAULT 1000;

-- submit_game_result clamps the applied delta to the rating bounds itself (it is the
-- writer of record for users.elo), so its 100/2500 bounds have to move with the scale.
-- Left at the old values, the first finalize after the data rescale would pin every
-- rating back down to 2500. Body is 010's verbatim apart from the two bounds; CREATE OR
-- REPLACE keeps the grant state established by 009/012.

CREATE OR REPLACE FUNCTION public.submit_game_result(
    p_game_id        uuid,
    p_winner_user_id uuid,
    p_loser_user_id  uuid,
    p_winner_index   smallint,
    p_new_winner_elo integer,   -- kept for signature compatibility; no longer used
    p_new_loser_elo  integer,   -- (deltas are applied to the locked current ELO)
    p_elo_change_p1  integer,
    p_elo_change_p2  integer,
    p_move_history   text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game         public.games%ROWTYPE;
    v_winner_delta integer;
    v_loser_delta  integer;
BEGIN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_game.status = 'finished' THEN
        RETURN false;  -- already finalized; idempotent
    END IF;

    -- player1's delta is p_elo_change_p1; map winner/loser via winner_index.
    IF p_winner_index = 0 THEN
        v_winner_delta := p_elo_change_p1;
        v_loser_delta  := p_elo_change_p2;
    ELSE
        v_winner_delta := p_elo_change_p2;
        v_loser_delta  := p_elo_change_p1;
    END IF;

    UPDATE public.games
       SET status        = 'finished',
           winner_id     = p_winner_user_id,
           winner_index  = p_winner_index,
           elo_change_p1 = p_elo_change_p1,
           elo_change_p2 = p_elo_change_p2,
           move_history  = p_move_history,
           completed_at  = now()
     WHERE id = p_game_id;

    -- Lock both user rows in a deterministic (id) order so two finishes sharing a
    -- player can't deadlock, then apply the CLAMPED deltas to the current value so
    -- concurrent games stack instead of overwriting.
    PERFORM 1 FROM public.users
     WHERE id IN (p_winner_user_id, p_loser_user_id)
     ORDER BY id
       FOR UPDATE;

    UPDATE public.users
       SET elo          = GREATEST(200, LEAST(5000, elo + v_winner_delta)),
           games_played = games_played + 1
     WHERE id = p_winner_user_id;

    UPDATE public.users
       SET elo          = GREATEST(200, LEAST(5000, elo + v_loser_delta)),
           games_played = games_played + 1
     WHERE id = p_loser_user_id;

    RETURN true;
END;
$$;
