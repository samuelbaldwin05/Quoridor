-- Security + integrity hardening (from the 2026-06-29 audit).
--   1. Lock the finalization/matchmaking RPCs to service_role only.
--   2. Remove the over-permissive games insert policy.
--   3. Dedupe friendships and enforce an unordered-pair unique index.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Privileged RPCs: revoke from `authenticated`.
--    These are SECURITY DEFINER and trust caller-supplied winner/ELO/queue data.
--    The backend calls them with the service-role key, and the frontend never
--    calls them directly, so authenticated clients have no reason to reach them
--    via PostgREST /rpc. service_role keeps EXECUTE (granted in 003).
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.submit_game_result(
    uuid, uuid, uuid, smallint, integer, integer, integer, integer, text[]
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_challenge(uuid, uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.match_in_queue(uuid, integer, integer, integer, text)
    FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. games insert policy.
--    games rows are only ever created by the SECURITY DEFINER RPCs above
--    (accept_challenge / match_in_queue), which bypass RLS. The wide-open
--    WITH CHECK (true) policy served no purpose and let any client with an
--    INSERT grant fabricate a game naming arbitrary players.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "games_anyone_insert" ON public.games;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. friendships: unordered-pair uniqueness.
--    The original UNIQUE (requester_id, receiver_id) only blocked one direction,
--    so (A→B) and (B→A) could both exist. Dedupe first (keep the earliest row
--    per unordered pair), then add a full unordered-pair unique index — mirroring
--    the challenges fix in 004.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.friendships f
USING public.friendships keep
WHERE LEAST(f.requester_id, f.receiver_id) = LEAST(keep.requester_id, keep.receiver_id)
  AND GREATEST(f.requester_id, f.receiver_id) = GREATEST(keep.requester_id, keep.receiver_id)
  AND f.id <> keep.id
  AND (
        keep.created_at < f.created_at
        OR (keep.created_at = f.created_at AND keep.id < f.id)
  );

ALTER TABLE public.friendships
    DROP CONSTRAINT IF EXISTS friendships_requester_id_receiver_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS friendships_unordered_pair
    ON public.friendships (
        LEAST(requester_id, receiver_id),
        GREATEST(requester_id, receiver_id)
    );
