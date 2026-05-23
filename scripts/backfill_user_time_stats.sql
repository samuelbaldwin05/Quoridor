-- One-off backfill of user_time_stats from finished games. Run once, after
-- applying migration 007, BEFORE any new games flow through the updated RPC.
-- After that point this script will overwrite live counters with whatever's
-- derivable from the games table.
--
-- Idempotent if no new games have been played between runs: re-running
-- against the same games set computes the same totals and replaces them.
--
-- The elo column is intentionally left at its default; we use a single
-- global rating on users.elo across all formats.

WITH per_game AS (
    SELECT
        g.winner_id  AS user_id,
        g.time_control,
        1::int       AS wins,
        0::int       AS losses
    FROM public.games g
    WHERE g.status = 'finished'
      AND g.winner_id IS NOT NULL
      AND g.time_control IS NOT NULL
    UNION ALL
    SELECT
        CASE WHEN g.winner_id = g.player1_id THEN g.player2_id ELSE g.player1_id END AS user_id,
        g.time_control,
        0::int AS wins,
        1::int AS losses
    FROM public.games g
    WHERE g.status = 'finished'
      AND g.winner_id IS NOT NULL
      AND g.time_control IS NOT NULL
      AND g.player1_id IS NOT NULL
      AND g.player2_id IS NOT NULL
),
totals AS (
    SELECT
        user_id,
        time_control,
        SUM(wins)::int   AS wins,
        SUM(losses)::int AS losses,
        (SUM(wins) + SUM(losses))::int AS games_played
    FROM per_game
    WHERE user_id IS NOT NULL
    GROUP BY user_id, time_control
)
INSERT INTO public.user_time_stats
    (user_id, time_control, games_played, wins, losses, updated_at)
SELECT
    t.user_id,
    t.time_control,
    t.games_played,
    t.wins,
    t.losses,
    now()
FROM totals t
ON CONFLICT (user_id, time_control) DO UPDATE
SET games_played = EXCLUDED.games_played,
    wins         = EXCLUDED.wins,
    losses       = EXCLUDED.losses,
    updated_at   = now();
