-- Drop the dead user_time_stats.elo column.
--
-- users.elo is the single global rating. user_time_stats.elo was seeded but never
-- written (submit_game_result stopped touching it in 007) and never read, so it only
-- made dev and prod diverge cosmetically. No code references it; seed.sql is updated in
-- the same change to stop inserting it.

ALTER TABLE public.user_time_stats DROP COLUMN IF EXISTS elo;
