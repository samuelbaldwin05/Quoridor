-- Lock the integrity-critical columns on public.users against direct client writes.
--
-- users_owner_update (001) allows a user to UPDATE their own row and has no WITH CHECK,
-- and Supabase's default table grants give `authenticated` UPDATE on the table. Together
-- that lets a client PATCH its own row over PostgREST and set elo / games_played
-- directly, forging its ranking. (DECISIONS previously called this inert on the
-- assumption no UPDATE was granted; verified against the running stack on 2026-08-06,
-- `authenticated` does hold UPDATE on public.users.)
--
-- A BEFORE UPDATE trigger blocks changes to the protected columns, but ONLY for a real
-- end-user request (auth.uid() is the row's own id). The service-role / SECURITY DEFINER
-- writes that legitimately move these columns run with auth.uid() = NULL and are
-- unaffected. Guarded columns and why a direct client write would be a forgery/bypass:
--   elo, games_played        ranking integrity
--   id, email, created_at    identity
--   username, username_chosen the 7-day rename cooldown + setup guard live only in the
--                             service layer (user_service), which a direct PATCH bypasses
--                             (it never advances username_updated_at)
--   last_seen_at             forging it keeps stale challenges alive vs cleanup_stale_challenges
-- display_name is intentionally left client-writable (cosmetic; also the OAuth refresh path).

CREATE OR REPLACE FUNCTION public.enforce_users_column_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    -- auth.uid() is NULL for service-role / SECURITY DEFINER writes (no end-user JWT),
    -- which are the only writers allowed to change these columns.
    IF auth.uid() IS NOT NULL THEN
        IF NEW.elo             IS DISTINCT FROM OLD.elo
        OR NEW.games_played    IS DISTINCT FROM OLD.games_played
        OR NEW.id              IS DISTINCT FROM OLD.id
        OR NEW.email           IS DISTINCT FROM OLD.email
        OR NEW.created_at      IS DISTINCT FROM OLD.created_at
        OR NEW.username        IS DISTINCT FROM OLD.username
        OR NEW.username_chosen IS DISTINCT FROM OLD.username_chosen
        OR NEW.last_seen_at    IS DISTINCT FROM OLD.last_seen_at THEN
            RAISE EXCEPTION 'protected user columns cannot be modified by the client'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_column_lock ON public.users;
CREATE TRIGGER users_column_lock
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_users_column_lock();

-- Give the self-update policy an explicit WITH CHECK too, so a client can never change
-- the row's owner (id) out from under the USING clause.
DROP POLICY IF EXISTS "users_owner_update" ON public.users;
CREATE POLICY "users_owner_update" ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
