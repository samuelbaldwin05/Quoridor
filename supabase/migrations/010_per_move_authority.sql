-- Per-move server authority + RPC concurrency hardening (CRITICAL Phase B).
--
-- !! NOT YET RUN against a live database — review + apply via `make db-reset`
--    (or push) and exercise with the Phase B live-test checklist before trusting.
--
--   1. append_game_move(): the per-move write path. Validation happens in Python
--      (the engine); this just locks the game and atomically appends one move with
--      an optimistic-concurrency guard on the current move count.
--   2. submit_game_result(): apply CLAMPED ELO DELTAS under row locks (was: write
--      absolute setpoints from an unlocked pre-read, which let two near-simultaneous
--      finishes for a shared player clobber each other).
--   3. match_in_queue(): lock the caller's own queue row up front so the mutual
--      A-locks-B / B-locks-A cross-row UPDATE cycle can't deadlock.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. append_game_move
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.append_game_move(
    p_game_id        uuid,
    p_move           text,
    p_expected_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game  public.games%ROWTYPE;
    v_count integer;
BEGIN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_game.status <> 'playing' THEN
        RAISE EXCEPTION 'game is not in progress' USING ERRCODE = '40001';
    END IF;

    -- Optimistic concurrency: the caller validated the move against a history of
    -- exactly p_expected_count moves. If the stored count differs, someone else
    -- advanced the game and the caller must resync.
    v_count := coalesce(array_length(v_game.move_history, 1), 0);
    IF v_count <> p_expected_count THEN
        RAISE EXCEPTION 'move count mismatch (have %, expected %)', v_count, p_expected_count
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.games
       SET move_history = array_append(move_history, p_move)
     WHERE id = p_game_id;

    RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.append_game_move(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.append_game_move(uuid, text, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. submit_game_result — clamped delta application under locks
-- ─────────────────────────────────────────────────────────────────────────────

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
       SET elo          = GREATEST(100, LEAST(2500, elo + v_winner_delta)),
           games_played = games_played + 1
     WHERE id = p_winner_user_id;

    UPDATE public.users
       SET elo          = GREATEST(100, LEAST(2500, elo + v_loser_delta)),
           games_played = games_played + 1
     WHERE id = p_loser_user_id;

    RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. match_in_queue — lock the caller's own row first (deadlock-free)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_in_queue(
    p_user_id      uuid,
    p_time_control integer,
    p_user_elo     integer,
    p_elo_band     integer,
    p_display_name text
)
RETURNS TABLE (
    game_id       uuid,
    opponent_id   uuid,
    opponent_name text,
    opponent_elo  integer,
    player_role   smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opponent    public.matchmaking_queue%ROWTYPE;
    v_p1_id       uuid;
    v_p2_id       uuid;
    v_p1_name     text;
    v_p2_name     text;
    v_game_id     uuid;
    v_caller_role smallint;
BEGIN
    -- Lock the caller's own waiting row up front. Combined with SKIP LOCKED on the
    -- opponent below, this removes the cross-row UPDATE lock cycle that could
    -- deadlock two players matching each other. Bail if the caller isn't waiting
    -- (already matched / left); the next poll retries.
    PERFORM 1 FROM public.matchmaking_queue
     WHERE user_id = p_user_id AND status = 'waiting'
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT * INTO v_opponent
    FROM public.matchmaking_queue
    WHERE time_control = p_time_control
      AND status        = 'waiting'
      AND user_id       <> p_user_id
      AND elo BETWEEN (p_user_elo - p_elo_band) AND (p_user_elo + p_elo_band)
    ORDER BY joined_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF random() < 0.5 THEN
        v_p1_id   := p_user_id;
        v_p1_name := p_display_name;
        v_p2_id   := v_opponent.user_id;
        v_p2_name := v_opponent.display_name;
        v_caller_role := 0;
    ELSE
        v_p1_id   := v_opponent.user_id;
        v_p1_name := v_opponent.display_name;
        v_p2_id   := p_user_id;
        v_p2_name := p_display_name;
        v_caller_role := 1;
    END IF;

    INSERT INTO public.games (mode, status, time_control, player1_id, player2_id, player1_name, player2_name)
    VALUES ('ranked', 'playing', p_time_control, v_p1_id, v_p2_id, v_p1_name, v_p2_name)
    RETURNING id INTO v_game_id;

    UPDATE public.matchmaking_queue
    SET status          = 'matched',
        matched_game_id = v_game_id,
        opponent_name   = p_display_name,
        opponent_elo    = p_user_elo
    WHERE user_id = v_opponent.user_id;

    UPDATE public.matchmaking_queue
    SET status          = 'matched',
        matched_game_id = v_game_id,
        opponent_name   = v_opponent.display_name,
        opponent_elo    = v_opponent.elo
    WHERE user_id = p_user_id;

    game_id       := v_game_id;
    opponent_id   := v_opponent.user_id;
    opponent_name := v_opponent.display_name;
    opponent_elo  := v_opponent.elo;
    player_role   := v_caller_role;
    RETURN NEXT;
END;
$$;
