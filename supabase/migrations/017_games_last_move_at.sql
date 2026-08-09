-- Add games.last_move_at so a disconnect forfeit can require a server-verified dwell.
--
-- The disconnect-forfeit result path (game_service.record_game_result, reason
-- "disconnect") awards the caller the win when it is the opponent's turn. Turn ownership
-- alone is not evidence of absence — it is the opponent's turn during normal play right
-- after the caller moves — so without a liveness signal a losing player could move and
-- instantly claim a win. last_move_at records when the last move was appended; the
-- service requires a minimum quiet period since then before honoring a disconnect claim,
-- so a present opponent who simply moves within the window cancels it.

ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS last_move_at timestamptz NOT NULL DEFAULT now();

-- append_game_move: same optimistic-concurrency append as 010, now also stamping
-- last_move_at on every accepted move.
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

    v_count := coalesce(array_length(v_game.move_history, 1), 0);
    IF v_count <> p_expected_count THEN
        RAISE EXCEPTION 'move count mismatch (have %, expected %)', v_count, p_expected_count
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.games
       SET move_history = array_append(move_history, p_move),
           last_move_at = now()
     WHERE id = p_game_id;

    RETURN v_count + 1;
END;
$$;

-- Keep the execute grants from 012 (CREATE OR REPLACE preserves them, but be explicit).
REVOKE ALL ON FUNCTION public.append_game_move(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_game_move(uuid, text, integer) TO service_role;
