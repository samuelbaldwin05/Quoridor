-- ONE-TIME: re-denominate existing ratings onto the 1000-base scale.
--
--   new = 1000 + 2 * (old - 500)
--
-- Paste into the Supabase SQL editor and run once, right after the deploy carrying
-- migration 019 (which moves the users.elo default and the bounds inside
-- submit_game_result). Running it BEFORE that deploy would leave every rescaled rating
-- above 2500 to be pinned back down by the old clamp on the next finished game.
--
-- Run it as the service role or from the SQL editor, NOT as an end user: the
-- users_column_lock trigger from 013 rejects elo writes whenever auth.uid() is non-NULL.
--
-- Safe to run twice. It marks the column with a comment on success and skips if that
-- marker is already there, because applying the doubling to already-rescaled ratings
-- would double the spread again. To deliberately re-run it, clear the marker first:
--   COMMENT ON COLUMN public.users.elo IS NULL;

DO $$
DECLARE
    v_marker text := 'rating scale: 1000-base';
    v_comment text;
BEGIN
    SELECT col_description(c.oid, a.attnum) INTO v_comment
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE c.relname = 'users'
       AND c.relnamespace = 'public'::regnamespace
       AND a.attname = 'elo';

    IF v_comment IS NOT NULL AND v_comment LIKE v_marker || '%' THEN
        RAISE NOTICE 'already on the 1000-base scale (%), skipping', v_comment;
        RETURN;
    END IF;

    -- Live ratings.
    UPDATE public.users
       SET elo = GREATEST(200, LEAST(5000, 1000 + 2 * (elo - 500)));

    -- Historical per-game deltas, so finished games in the ranked history list read on
    -- the same scale as the ratings they produced. Pure magnitudes, so they double
    -- without the base shift.
    UPDATE public.games
       SET elo_change_p1 = elo_change_p1 * 2
     WHERE elo_change_p1 IS NOT NULL;

    UPDATE public.games
       SET elo_change_p2 = elo_change_p2 * 2
     WHERE elo_change_p2 IS NOT NULL;

    -- Transient queue rows: rescaled rather than deleted so anyone sitting in the queue
    -- mid-deploy keeps matching sanely.
    UPDATE public.matchmaking_queue
       SET elo = GREATEST(200, LEAST(5000, 1000 + 2 * (elo - 500)));

    UPDATE public.matchmaking_queue
       SET opponent_elo = GREATEST(200, LEAST(5000, 1000 + 2 * (opponent_elo - 500)))
     WHERE opponent_elo IS NOT NULL;

    -- Puzzle difficulty estimates are on the same player scale.
    UPDATE public.puzzles
       SET estimated_elo = GREATEST(200, LEAST(5000, 1000 + 2 * (estimated_elo - 500)))
     WHERE estimated_elo IS NOT NULL;

    -- Belt and braces if this is run ahead of the migration: the default is what new
    -- signups get, and 1000 is the only sane value once the pool has moved.
    ALTER TABLE public.users ALTER COLUMN elo SET DEFAULT 1000;

    EXECUTE format(
        'COMMENT ON COLUMN public.users.elo IS %L',
        v_marker || ' (rescaled ' || current_date || ')'
    );

    RAISE NOTICE 'rescaled % users onto the 1000-base scale',
        (SELECT count(*) FROM public.users);
END $$;

-- Sanity check: nobody should be outside the new bounds, and the ladder should look
-- roughly twice as spread out as it did.
SELECT min(elo) AS lowest, round(avg(elo)) AS average, max(elo) AS highest
  FROM public.users
 WHERE games_played > 0;
