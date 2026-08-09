-- Remove direct client WRITE access to tables that only the backend should write.
--
-- Supabase's default table grants give anon/authenticated INSERT/UPDATE/DELETE on every
-- public table (verified against the running stack 2026-08-06), and several write
-- policies have no WITH CHECK, so a client can forge rows directly over PostgREST:
--   - games: a participant could UPDATE their own game's move_history/winner_id/status.
--     move_history is exactly what the result endpoint replays to confirm a win, so this
--     is a forgery path straight into the server-authoritative model.
--   - challenges: a participant could rewrite status/game_id, bypassing accept_challenge.
--   - friendships: FOR ALL with no WITH CHECK lets a user forge an inbound request or
--     self-accept an outgoing one.
--   - matchmaking_queue: a client could insert its own elo and pick weak ranked opponents.
--
-- The application never writes any of these tables directly from the client: every write
-- goes through the backend with the SERVICE ROLE (which bypasses RLS) or a SECURITY
-- DEFINER RPC. The frontend only READS (leaderboard, profile, pending counts) via the
-- SELECT policies, which are left intact. So dropping the client write policies closes
-- the forgery surface with no effect on the app; a client write is then denied by RLS
-- default-deny while service-role/RPC writes are unaffected.

-- games: only the SECURITY DEFINER RPCs (service role) create/finalize games.
DROP POLICY IF EXISTS "games_participants_update" ON public.games;

-- challenges: created/accepted/cancelled only via the backend (service role) + RPC.
DROP POLICY IF EXISTS "challenges_challenger_insert"   ON public.challenges;
DROP POLICY IF EXISTS "challenges_participants_update" ON public.challenges;
DROP POLICY IF EXISTS "challenges_participants_delete" ON public.challenges;

-- friendships: all mutations go through the backend (service role). Public read stays.
DROP POLICY IF EXISTS "friendships_owner_write" ON public.friendships;

-- matchmaking_queue: the backend enqueues/dequeues with the service role and stamps elo
-- from the authoritative users row. Owner SELECT stays; client writes are removed.
DROP POLICY IF EXISTS "queue_owner_insert" ON public.matchmaking_queue;
DROP POLICY IF EXISTS "queue_owner_update" ON public.matchmaking_queue;
DROP POLICY IF EXISTS "queue_owner_delete" ON public.matchmaking_queue;
