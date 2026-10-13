-- Reporting views for the product KPIs: games played, online games played, unique users
-- (authenticated plus guest), and authenticated users.
--
-- Views rather than a counters table: every number here is derivable from `games` and
-- `auth.users`, and a counter that can drift from the rows it counts is worse than no
-- counter. Nothing writes to these.
--
-- Readable by service_role only. Supabase's default privileges grant new objects in
-- `public` to `anon` and `authenticated`, which would publish a live user count to anyone
-- holding the publishable key, so those grants are revoked below. The views are left with
-- the default (owner's rights) rather than `security_invoker`, because they read
-- `auth.users`, which is owned by the auth admin role.
--
-- A guest who plays a game gets an anonymous Supabase session (see
-- `useAuth.ensureGuestSession`), which is what makes a non-authenticated player countable
-- at all. The local dev login is also an anonymous session, so it is tagged
-- `login_kind = 'dev'` and excluded here: without that, a dev login against a hosted
-- project would inflate the guest count. Untagged anonymous users predate the tag and were
-- dev logins, so they are excluded too.

CREATE OR REPLACE VIEW public.kpi_summary AS
WITH game_counts AS (
    SELECT
        count(*)                                                        AS games_total,
        count(*) FILTER (WHERE mode IN ('ranked', 'casual'))            AS games_online,
        count(*) FILTER (WHERE mode IN ('vs_ai', 'pass_and_play'))      AS games_local,
        count(*) FILTER (WHERE status = 'finished')                     AS games_finished
    FROM public.games
),
user_counts AS (
    SELECT
        count(*) FILTER (WHERE NOT coalesce(is_anonymous, false))       AS users_authenticated,
        count(*) FILTER (
            WHERE coalesce(is_anonymous, false)
              AND raw_user_meta_data ->> 'login_kind' = 'guest'
        )                                                               AS users_guest
    FROM auth.users
),
player_counts AS (
    SELECT count(*) AS players_with_a_game
    FROM (
        SELECT player1_id AS id FROM public.games
        UNION
        SELECT player2_id AS id FROM public.games
    ) p
    WHERE p.id IS NOT NULL
)
SELECT
    g.games_total,
    g.games_online,
    g.games_local,
    g.games_finished,
    u.users_authenticated,
    u.users_guest,
    u.users_authenticated + u.users_guest AS users_total,
    pl.players_with_a_game
FROM game_counts g, user_counts u, player_counts pl;

-- Trend views, so a total can be read as growth rather than one number.

CREATE OR REPLACE VIEW public.kpi_games_daily AS
SELECT
    created_at::date AS day,
    mode,
    count(*)         AS games
FROM public.games
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.kpi_users_daily AS
SELECT
    created_at::date AS day,
    CASE WHEN coalesce(is_anonymous, false) THEN 'guest' ELSE 'authenticated' END AS kind,
    count(*) AS users
FROM auth.users
WHERE NOT coalesce(is_anonymous, false)
   OR raw_user_meta_data ->> 'login_kind' = 'guest'
GROUP BY 1, 2;

REVOKE ALL ON public.kpi_summary      FROM anon, authenticated;
REVOKE ALL ON public.kpi_games_daily  FROM anon, authenticated;
REVOKE ALL ON public.kpi_users_daily  FROM anon, authenticated;

GRANT SELECT ON public.kpi_summary     TO service_role;
GRANT SELECT ON public.kpi_games_daily TO service_role;
GRANT SELECT ON public.kpi_users_daily TO service_role;
