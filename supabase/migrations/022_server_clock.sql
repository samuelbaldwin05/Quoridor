-- Give the server enough of a clock to check a flag claim rather than trust it.
--
-- A game only counts once submit_game_result marks it finished, and one way a real ending
-- never got there was a timeout nobody could report: the result endpoint records the
-- caller as the loser, so only the player whose own clock hit zero could report it. A
-- backgrounded, sleeping or closed tab never notices its own flag, and the opponent
-- watched 0:00 with no way to end the game.
--
-- Letting the other player claim it means the server has to verify the claim, and that
-- needs a clock. There was none: game_moves is unused by the current write path, so the
-- only timing the server had was last_move_at, the current turn's elapsed time.

-- ── per-player consumed clock ────────────────────────────────────────────────
-- Seconds each player has spent on their own moves, accumulated move by move. Remaining
-- time for a player is time_control - time_used_pN, minus the current turn's elapsed
-- time (now() - last_move_at) when it is their move.
--
-- Deliberately a server-side reconstruction, not a mirror of the client clocks: the
-- clients also pause on opponent disconnect, which the server cannot see. So time_used
-- is an upper bound on what a client would show, and any check against it needs a margin
-- (see FLAG_CLAIM_MARGIN_SECONDS in game_service).
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS time_used_p1 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS time_used_p2 integer NOT NULL DEFAULT 0;

-- append_game_move: 017's body, now also charging the mover for their think time. The
-- first move is free, matching the client, which holds both clocks until the game is
-- actually under way (the 20 second start grace covers that window instead).
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
    v_game    public.games%ROWTYPE;
    v_count   integer;
    v_elapsed integer := 0;
BEGIN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_game.status <> 'playing' THEN
        RAISE EXCEPTION 'game is not in progress' USING ERRCODE = '40001';
    END IF;

    v_count := coalesce(array_length(v_game.move_history, 1), 0);
    IF v_count <> p_expected_count THEN
        RAISE EXCEPTION 'move count mismatch (have %, expected %)', v_count, p_expected_count
            USING ERRCODE = '40001';
    END IF;

    -- Move number v_count (0-based) belongs to player v_count % 2, so player1 owns the
    -- even ones. Charge them everything since the previous move landed.
    IF v_count > 0 THEN
        v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_game.last_move_at)))::integer;
    END IF;

    UPDATE public.games
       SET move_history = array_append(move_history, p_move),
           last_move_at = now(),
           time_used_p1 = time_used_p1 + CASE WHEN v_count % 2 = 0 THEN v_elapsed ELSE 0 END,
           time_used_p2 = time_used_p2 + CASE WHEN v_count % 2 = 1 THEN v_elapsed ELSE 0 END
     WHERE id = p_game_id;

    RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.append_game_move(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_game_move(uuid, text, integer) TO service_role;
