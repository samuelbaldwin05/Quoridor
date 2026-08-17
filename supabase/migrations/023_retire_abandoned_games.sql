-- Retire games both players walked away from.
--
-- The other way a game stops without being recorded: both clients leave a live game and
-- the row sits in 'playing' forever. Nothing counted it and nothing ever will, but it
-- keeps 'playing' from meaning "live", which both the flag check (migration 022) and any
-- diagnosis of missing games rely on.

-- ── cleanup_abandoned_games ──────────────────────────────────────────────────
-- Retire games both players walked away from. They cannot be scored (no winner was ever
-- proven), so this is not a result: it moves them out of 'playing' and leaves winner_id
-- NULL, which is what marks a row as abandoned rather than finished. Nothing counts them,
-- and the finished-games history list filters on status = 'finished', so they stay out of
-- it. The point is that 'playing' keeps meaning "live", for diagnosis and for the flag
-- check in migration 022.
--
-- The threshold is hours, not minutes: no real game runs that long (the longest control
-- is 10 minutes a side, and even a heavily paused one resolves in well under an hour), so
-- there is no chance of retiring a game that is merely slow.
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_games(p_idle_hours integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH abandoned AS (
        UPDATE public.games
           SET status       = 'resigned',
               completed_at = now()
         WHERE status = 'playing'
           AND last_move_at < now() - make_interval(hours => p_idle_hours)
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM abandoned;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_abandoned_games(integer) FROM public;
REVOKE ALL ON FUNCTION public.cleanup_abandoned_games(integer) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_abandoned_games(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_games(integer) TO service_role;

CREATE INDEX IF NOT EXISTS idx_games_playing_last_move
    ON public.games (last_move_at)
    WHERE status = 'playing';
