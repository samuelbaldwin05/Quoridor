-- Schema hardening: challenge expiry, bidirectional dedupe, useful indexes.

-- challenges: expiry + bidirectional pending dedupe
ALTER TABLE public.challenges
    ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

-- Old constraint only blocked (challenger=A, challenged=B); the reverse pair
-- could still slip through. Replace with a partial unique index on the
-- unordered pair, scoped to pending challenges so historical rows are unaffected.
ALTER TABLE public.challenges
    DROP CONSTRAINT IF EXISTS challenges_challenger_id_challenged_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS challenges_pending_unordered_pair
    ON public.challenges (
        LEAST(challenger_id, challenged_id),
        GREATEST(challenger_id, challenged_id)
    )
    WHERE status = 'pending';

-- Sweep expired pending challenges. Called from the API (or a scheduled
-- function) — cheap because of the partial index below.
CREATE INDEX IF NOT EXISTS idx_challenges_pending_expires
    ON public.challenges (expires_at)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.expire_old_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH expired AS (
        DELETE FROM public.challenges
        WHERE status = 'pending' AND expires_at < now()
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM expired;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_old_challenges() TO service_role;


-- games: index for "active games for a player" lookups
CREATE INDEX IF NOT EXISTS idx_games_player1_status
    ON public.games (player1_id, status);
CREATE INDEX IF NOT EXISTS idx_games_player2_status
    ON public.games (player2_id, status);


-- user_time_stats: covering index for the per-user-per-tc fetch path
CREATE INDEX IF NOT EXISTS idx_user_time_stats_user_tc
    ON public.user_time_stats (user_id, time_control);
