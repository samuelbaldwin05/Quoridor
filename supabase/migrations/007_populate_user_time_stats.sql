-- Make submit_game_result write per-time-control aggregates so the profile
-- modal can show real wins/losses by format. The previous version only
-- updated users.elo and users.games_played.
--
-- Note: user_time_stats.elo is intentionally NOT updated here. We keep a
-- single global elo on users.elo across all formats; the column on this table
-- stays at its default and is unused by current readers.

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

    -- Per-format aggregates. elo column is left at its default; we use a
    -- single global rating on users.elo.
    IF v_game.time_control IS NOT NULL THEN
        INSERT INTO public.user_time_stats
            (user_id, time_control, games_played, wins, losses, updated_at)
        VALUES
            (p_winner_user_id, v_game.time_control, 1, 1, 0, now())
        ON CONFLICT (user_id, time_control) DO UPDATE
        SET games_played = public.user_time_stats.games_played + 1,
            wins         = public.user_time_stats.wins + 1,
            updated_at   = now();

        INSERT INTO public.user_time_stats
            (user_id, time_control, games_played, wins, losses, updated_at)
        VALUES
            (p_loser_user_id, v_game.time_control, 1, 0, 1, now())
        ON CONFLICT (user_id, time_control) DO UPDATE
        SET games_played = public.user_time_stats.games_played + 1,
            losses       = public.user_time_stats.losses + 1,
            updated_at   = now();
    END IF;

    RETURN true;
END;
$$;
