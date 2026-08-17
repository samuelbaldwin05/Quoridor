-- Restore the per-time-control stat writes to submit_game_result, and rebuild the
-- aggregates that went stale while they were missing.
--
-- Migration 007 added a user_time_stats upsert to submit_game_result so the profile
-- could show wins/losses by format. Migration 010 rewrote the whole function for the
-- clamped-delta rewrite and did not carry that block forward; 019 copied 010. So from
-- 010 onward nothing has written user_time_stats: every row is frozen at its pre-010
-- value while users.games_played kept climbing.
--
-- That is what makes a profile card read wrong rather than merely stale. The readers
-- (ProfilePage, ProfileModal) take wins from user_time_stats and the game total from
-- users.games_played, so the displayed win rate is an old numerator over a current
-- denominator, and per-format totals stop at whenever 010 deployed.
--
-- Two parts: the function fix, then a one-time rebuild of both counters from the games
-- table, which is the ledger these are derived from.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. submit_game_result — 019's body plus the user_time_stats upsert from 007
-- ─────────────────────────────────────────────────────────────────────────────
-- Body is 019's verbatim apart from the restored aggregate block. CREATE OR REPLACE
-- keeps the grant state established by 009/012 (service_role only).

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
       SET elo          = GREATEST(200, LEAST(5000, elo + v_winner_delta)),
           games_played = games_played + 1
     WHERE id = p_winner_user_id;

    UPDATE public.users
       SET elo          = GREATEST(200, LEAST(5000, elo + v_loser_delta)),
           games_played = games_played + 1
     WHERE id = p_loser_user_id;

    -- Per-format aggregates (restored from 007). There is no per-format rating:
    -- users.elo is the single global one, and 014 dropped the dead elo column here.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One-time rebuild of the derived counters
-- ─────────────────────────────────────────────────────────────────────────────
-- public.games is the ledger: one finished row per counted game, carrying both player
-- ids, the winner and the time control. Both counters below are just aggregates over
-- it, so recomputing is exact rather than a guess, and re-running is a no-op.
--
-- What counts, matching what submit_game_result increments: a finished game with two
-- human players and a winner. Bot games (mode 'vs_ai', player2_id NULL) are
-- history-only by design (see 011) and never counted; unfinished and aborted games
-- have no winner and are not counted either.
--
-- Unlike the 019 rescale this lives in the migration rather than a hand-run snippet:
-- it derives its result from the ledger instead of transforming existing values, so
-- it is safe to replay on any database, including a fresh one where it is a no-op.

-- Wrapped in a DO block purely so the counted-games set can be materialised once into a
-- temp table and reused by the four statements below; a DO body always runs inside a
-- transaction, so the table cannot outlive this migration.

DO $$
BEGIN
    DROP TABLE IF EXISTS _counted_games;

    CREATE TEMP TABLE _counted_games AS
    SELECT g.player1_id AS user_id,
           g.time_control,
           (g.winner_id = g.player1_id) AS won
      FROM public.games g
     WHERE g.status = 'finished'
       AND g.mode <> 'vs_ai'
       AND g.player1_id IS NOT NULL
       AND g.player2_id IS NOT NULL
       AND g.winner_id  IS NOT NULL
    UNION ALL
    SELECT g.player2_id,
           g.time_control,
           (g.winner_id = g.player2_id)
      FROM public.games g
     WHERE g.status = 'finished'
       AND g.mode <> 'vs_ai'
       AND g.player1_id IS NOT NULL
       AND g.player2_id IS NOT NULL
       AND g.winner_id  IS NOT NULL;

    -- Per-format rows. A game with no time control (none today, but the column is
    -- nullable) counts toward the user total below and toward no format row, which is
    -- exactly what the RPC does.
    DELETE FROM public.user_time_stats s
     WHERE NOT EXISTS (
        SELECT 1 FROM _counted_games c
         WHERE c.user_id = s.user_id
           AND c.time_control = s.time_control
     );

    INSERT INTO public.user_time_stats
        (user_id, time_control, games_played, wins, losses, updated_at)
    SELECT c.user_id,
           c.time_control,
           count(*),
           count(*) FILTER (WHERE c.won),
           count(*) FILTER (WHERE NOT c.won),
           now()
      FROM _counted_games c
     WHERE c.time_control IS NOT NULL
     GROUP BY c.user_id, c.time_control
    ON CONFLICT (user_id, time_control) DO UPDATE
    SET games_played = EXCLUDED.games_played,
        wins         = EXCLUDED.wins,
        losses       = EXCLUDED.losses,
        updated_at   = now();

    -- User totals. This can move a count in either direction; the ledger wins. The
    -- count also feeds the provisional K taper in elo_service, so an inflated one would
    -- otherwise keep K tapering for games that were never played.
    UPDATE public.users u
       SET games_played = t.n
      FROM (
        SELECT user_id, count(*)::integer AS n FROM _counted_games GROUP BY user_id
      ) t
     WHERE u.id = t.user_id
       AND u.games_played IS DISTINCT FROM t.n;

    UPDATE public.users u
       SET games_played = 0
     WHERE u.games_played <> 0
       AND NOT EXISTS (SELECT 1 FROM _counted_games c WHERE c.user_id = u.id);

    DROP TABLE _counted_games;
END $$;
