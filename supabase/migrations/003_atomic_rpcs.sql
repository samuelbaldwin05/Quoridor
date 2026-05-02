-- Atomic RPCs that replace multi-step read-modify-write flows in the API,
-- closing race windows in challenge accept, game result submission, and
-- matchmaking queue pairing.

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_challenge
-- ─────────────────────────────────────────────────────────────────────────────
-- Locks the challenge row, validates state + caller, creates the game, and
-- updates the challenge in one transaction. Returns the new game_id.
CREATE OR REPLACE FUNCTION public.accept_challenge(
    p_challenge_id uuid,
    p_user_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chal       public.challenges%ROWTYPE;
    v_game_id    uuid;
BEGIN
    SELECT * INTO v_chal
    FROM public.challenges
    WHERE id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'challenge not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_chal.challenged_id <> p_user_id THEN
        RAISE EXCEPTION 'only the challenged player can accept' USING ERRCODE = '42501';
    END IF;

    IF v_chal.status <> 'pending' THEN
        RAISE EXCEPTION 'challenge is no longer pending' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.games (player1_id, player2_id, mode, status, time_control)
    VALUES (v_chal.challenger_id, v_chal.challenged_id, 'casual', 'playing', v_chal.time_control)
    RETURNING id INTO v_game_id;

    UPDATE public.challenges
    SET status = 'accepted',
        game_id = v_game_id
    WHERE id = p_challenge_id;

    RETURN v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_challenge(uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- submit_game_result
-- ─────────────────────────────────────────────────────────────────────────────
-- Locks the game row, finishes it only if still in 'playing', and updates
-- both player ELOs in one transaction. Returns true if this caller was the
-- one to finalize, false if the game was already finished.
CREATE OR REPLACE FUNCTION public.submit_game_result(
    p_game_id           uuid,
    p_winner_user_id    uuid,
    p_loser_user_id     uuid,
    p_winner_index      smallint,
    p_new_winner_elo    integer,
    p_new_loser_elo     integer,
    p_elo_change_p1     integer,
    p_elo_change_p2     integer,
    p_move_history      text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game public.games%ROWTYPE;
BEGIN
    SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_game.status = 'finished' THEN
        RETURN false;
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

    UPDATE public.users
    SET elo          = p_new_winner_elo,
        games_played = games_played + 1
    WHERE id = p_winner_user_id;

    UPDATE public.users
    SET elo          = p_new_loser_elo,
        games_played = games_played + 1
    WHERE id = p_loser_user_id;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_game_result(
    uuid, uuid, uuid, smallint, integer, integer, integer, integer, text[]
) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- match_in_queue
-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic "pair me with a waiting opponent and create the game". Uses
-- SELECT ... FOR UPDATE SKIP LOCKED so two concurrent callers cannot claim
-- the same opponent. Caller must already have a 'waiting' row in the queue.
-- Returns NULL if no opponent was claimed (caller stays waiting), otherwise
-- returns matched_game_id.
CREATE OR REPLACE FUNCTION public.match_in_queue(
    p_user_id        uuid,
    p_time_control   integer,
    p_user_elo       integer,
    p_elo_band       integer,
    p_display_name   text
)
RETURNS TABLE (
    game_id        uuid,
    opponent_id    uuid,
    opponent_name  text,
    opponent_elo   integer,
    player_role    smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opponent       public.matchmaking_queue%ROWTYPE;
    v_p1_id          uuid;
    v_p2_id          uuid;
    v_p1_name        text;
    v_p2_name        text;
    v_game_id        uuid;
    v_caller_role    smallint;
BEGIN
    -- Claim a single waiting opponent atomically. SKIP LOCKED ensures two
    -- simultaneous callers never grab the same row.
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

    -- Random side assignment via simple coin flip
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

    -- Mark both queue rows matched. We already hold the lock on opponent;
    -- caller's row is also updated here so the next /status poll sees it.
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

GRANT EXECUTE ON FUNCTION public.match_in_queue(uuid, integer, integer, integer, text) TO authenticated, service_role;
