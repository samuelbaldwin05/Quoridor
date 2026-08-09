-- Close the privileged-RPC execute gap left open by 009 and 010.
--
-- Every SECURITY DEFINER function here trusts caller-supplied data (winner, Elo,
-- identity, queue state) and does NO internal auth.uid() check, by design: they are
-- only ever called by the backend with the SERVICE ROLE key. But two earlier revokes
-- were incomplete:
--   - 009 revoked EXECUTE FROM authenticated on submit_game_result / accept_challenge /
--     match_in_queue, but Supabase's default privileges grant EXECUTE to `anon` (and
--     `authenticated`) on every new function in `public`, and a `REVOKE ... FROM
--     authenticated` does not touch the `anon` grant. So they stayed callable by `anon`
--     over PostgREST /rpc — a client could finalize its own in-progress ranked game as
--     winner with a favorable Elo delta, or accept a challenge on another user's behalf.
--   - 010 revoked append_game_move FROM public, but the explicit `anon`/`authenticated`
--     grants (again from Supabase defaults) survive a FROM public revoke, so it stayed
--     callable too (letting a client inject moves into any live game).
--
-- Verified against the running local stack (2026-08-06): before this migration,
-- `anon` held EXECUTE on all of these. The frontend makes zero .rpc() calls and the
-- backend uses the service role, so revoking from public/anon/authenticated and
-- granting only to service_role cannot affect the application.

REVOKE ALL ON FUNCTION public.submit_game_result(
    uuid, uuid, uuid, smallint, integer, integer, integer, integer, text[]
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_game_result(
    uuid, uuid, uuid, smallint, integer, integer, integer, integer, text[]
) TO service_role;

REVOKE ALL ON FUNCTION public.accept_challenge(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_challenge(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.match_in_queue(uuid, integer, integer, integer, text)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_in_queue(uuid, integer, integer, integer, text)
    TO service_role;

REVOKE ALL ON FUNCTION public.expire_old_challenges() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_challenges() TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_stale_challenges() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_challenges() TO service_role;

REVOKE ALL ON FUNCTION public.append_game_move(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_game_move(uuid, text, integer) TO service_role;
