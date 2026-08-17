-- Why does a player's game count read low? Paste into the Supabase SQL editor.
--
-- Read-only. Run it before and after migration 020 deploys: 020 restores the
-- per-format stat write that 010 dropped and rebuilds both counters from the games
-- table, so afterwards query 1 should show no drift at all. Anything still missing is
-- a game that never FINALIZED, which is a different bug: only a finished row with a
-- winner is a game as far as ratings and stats are concerned, so a game left in
-- 'playing' is invisible to every counter no matter how it was played.

-- 1. Counters vs the ledger, per user. drift <> 0 means the counters are wrong;
--    stuck > 0 means real games are sitting unfinalized and no counter will ever
--    see them. Bot games are excluded on purpose (history only, see migration 011).
SELECT u.username,
       u.games_played AS counter,
       (SELECT count(*) FROM public.games g
         WHERE g.status = 'finished' AND g.mode <> 'vs_ai'
           AND g.winner_id IS NOT NULL
           AND g.player2_id IS NOT NULL
           AND u.id IN (g.player1_id, g.player2_id)) AS ledger,
       u.games_played
         - (SELECT count(*) FROM public.games g
             WHERE g.status = 'finished' AND g.mode <> 'vs_ai'
               AND g.winner_id IS NOT NULL
               AND g.player2_id IS NOT NULL
               AND u.id IN (g.player1_id, g.player2_id)) AS drift,
       (SELECT count(*) FROM public.games g
         WHERE g.status <> 'finished' AND g.mode <> 'vs_ai'
           AND u.id IN (g.player1_id, g.player2_id)) AS stuck,
       (SELECT count(*) FROM public.games g
         WHERE g.mode = 'vs_ai' AND g.player1_id = u.id) AS bot_games,
       (SELECT coalesce(sum(s.games_played), 0) FROM public.user_time_stats s
         WHERE s.user_id = u.id) AS per_format_total
  FROM public.users u
 WHERE u.games_played > 0
    OR EXISTS (SELECT 1 FROM public.games g
                WHERE g.mode <> 'vs_ai' AND u.id IN (g.player1_id, g.player2_id))
 ORDER BY stuck DESC, drift DESC;

-- 2. Every non-bot game by mode and status. A pile of rows in 'playing' with an old
--    created_at is the unfinalized-game hole, not a counter problem.
SELECT mode, status, count(*), min(created_at)::date AS oldest, max(created_at)::date AS newest
  FROM public.games
 WHERE mode <> 'vs_ai'
 GROUP BY mode, status
 ORDER BY mode, status;

-- 3. The stuck games themselves, newest first. move_count and quiet_for say how the
--    game died: 0 moves is an abandoned start (expected, and correctly uncounted),
--    while a long game gone quiet is one that reached an ending nobody could record.
SELECT g.id,
       g.mode,
       g.status,
       g.time_control,
       p1.username AS player1,
       p2.username AS player2,
       coalesce(array_length(g.move_history, 1), 0) AS move_count,
       g.created_at,
       now() - coalesce(g.last_move_at, g.created_at) AS quiet_for
  FROM public.games g
  LEFT JOIN public.users p1 ON p1.id = g.player1_id
  LEFT JOIN public.users p2 ON p2.id = g.player2_id
 WHERE g.status <> 'finished'
   AND g.mode <> 'vs_ai'
 ORDER BY g.created_at DESC
 LIMIT 50;

-- 4. Finished games that somehow carry no Elo delta. Should return nothing: every
--    finalize writes both deltas in the same transaction as the status change.
SELECT id, mode, created_at, completed_at, elo_change_p1, elo_change_p2
  FROM public.games
 WHERE status = 'finished'
   AND mode <> 'vs_ai'
   AND (elo_change_p1 IS NULL OR elo_change_p2 IS NULL)
 ORDER BY completed_at DESC
 LIMIT 20;
