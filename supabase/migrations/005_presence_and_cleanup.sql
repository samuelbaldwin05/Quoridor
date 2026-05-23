-- Presence tracking + tighter challenge cleanup.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON public.users (last_seen_at);


-- cleanup_stale_challenges
-- Deletes pending challenges where either party hasn't pinged in 30 seconds.
-- "Pinged" = made any authed API call. Frontend polls (NavSidebar, FriendsPage,
-- ChallengeRedirector) act as implicit heartbeats every ~5s, so a 30s threshold
-- with a generous buffer is safe.
CREATE OR REPLACE FUNCTION public.cleanup_stale_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    WITH stale AS (
        DELETE FROM public.challenges c
        WHERE c.status = 'pending'
          AND EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.id IN (c.challenger_id, c.challenged_id)
                AND u.last_seen_at < now() - interval '30 seconds'
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_count FROM stale;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_challenges() TO authenticated, service_role;


-- accept_challenge — replace 003's version. Now also deletes other pending
-- challenges involving either player at the moment they enter a game,
-- so neither side can accept two challenges concurrently.
CREATE OR REPLACE FUNCTION public.accept_challenge(
    p_challenge_id uuid,
    p_user_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_chal    public.challenges%ROWTYPE;
    v_game_id uuid;
BEGIN
    SELECT * INTO v_chal
    FROM public.challenges
    WHERE id = p_challenge_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'challenge not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_chal.challenged_id <> p_user_id THEN
        RAISE EXCEPTION 'only the challenged player can accept' USING ERRCODE = '42501';
    END IF;

    IF v_chal.status <> 'pending' THEN
        RAISE EXCEPTION 'challenge is no longer pending' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.games (player1_id, player2_id, mode, status, time_control)
    VALUES (v_chal.challenger_id, v_chal.challenged_id, 'casual', 'playing', v_chal.time_control)
    RETURNING id INTO v_game_id;

    UPDATE public.challenges
    SET status = 'accepted',
        game_id = v_game_id
    WHERE id = p_challenge_id;

    -- Cancel any OTHER pending challenges involving either player. Both are
    -- now in a game; outstanding invites either direction are no longer valid.
    DELETE FROM public.challenges
    WHERE status = 'pending'
      AND id <> p_challenge_id
      AND (
          challenger_id IN (v_chal.challenger_id, v_chal.challenged_id)
          OR challenged_id IN (v_chal.challenger_id, v_chal.challenged_id)
      );

    RETURN v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_challenge(uuid, uuid) TO authenticated, service_role;
