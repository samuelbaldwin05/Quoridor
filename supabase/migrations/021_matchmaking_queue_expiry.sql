-- Let matchmaking queue rows expire.
--
-- Today a row leaves the queue only when the client asks it to: the Cancel button or the
-- DELETE the game page fires on start. Close the tab, lose the network, or let the laptop
-- sleep and the row waits forever. Those ghosts are not merely untidy, they are matchable:
-- match_in_queue happily pairs a live player with someone who left an hour ago, and the
-- victim gets a game that aborts after the 20 second start grace.
--
-- Two expiries, both swept here rather than trusted to the client:
--   idle      the client stopped polling /matchmaking/status, so it is gone
--   max wait  nobody turned up within the search cap, so stop searching
--
-- Thresholds are parameters, not literals, so they stay defined in one place next to the
-- rest of the matchmaking tuning (app/services/matchmaking_service.py). The defaults here
-- only matter if something calls the function without arguments.

-- ── last_polled_at ────────────────────────────────────────────────────────────
-- Heartbeat for a waiting row, refreshed by every status poll (~2.5s while the modal is
-- open). users.last_seen_at is not a substitute: it is only touched on the user-upsert
-- path, so it tracks "this account made an authed call somewhere", not "this client is
-- still watching the queue". Defaults to now() so existing rows are not swept on sight.
ALTER TABLE public.matchmaking_queue
    ADD COLUMN IF NOT EXISTS last_polled_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_last_polled
    ON public.matchmaking_queue (last_polled_at);

-- ── cleanup_stale_queue_entries ───────────────────────────────────────────────
-- Deletes waiting rows that went quiet or outstayed the cap. Rows already carrying a
-- matched_game_id are left alone: the match exists, and both clients still read that row
-- to find out where to go.
CREATE OR REPLACE FUNCTION public.cleanup_stale_queue_entries(
    p_idle_seconds     integer DEFAULT 45,
    p_max_wait_seconds integer DEFAULT 300
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH stale AS (
        DELETE FROM public.matchmaking_queue q
        WHERE q.status = 'waiting'
          AND q.matched_game_id IS NULL
          AND (
              q.last_polled_at < now() - make_interval(secs => p_idle_seconds)
              OR q.joined_at   < now() - make_interval(secs => p_max_wait_seconds)
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM stale;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_queue_entries(integer, integer) FROM public;
REVOKE ALL ON FUNCTION public.cleanup_stale_queue_entries(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_queue_entries(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_queue_entries(integer, integer) TO service_role;
