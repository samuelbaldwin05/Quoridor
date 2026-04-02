-- Migration 003: per-time-control ELO stats and ELO-based matchmaking queue
-- Adds user_time_stats, matchmaking_queue, and elo_change columns on games.

-- ─────────────────────────────────────────────
-- 1. public.user_time_stats
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_time_stats (
    user_id      UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    time_control INTEGER NOT NULL,  -- seconds: 180 | 300 | 600
    games_played INTEGER NOT NULL DEFAULT 0,
    wins         INTEGER NOT NULL DEFAULT 0,
    losses       INTEGER NOT NULL DEFAULT 0,
    elo          INTEGER NOT NULL DEFAULT 1200,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, time_control)
);

-- ─────────────────────────────────────────────
-- 2. public.matchmaking_queue
-- ─────────────────────────────────────────────
-- player_key is a stable opaque ID for pre-auth / guest sessions.
-- user_id is nullable and set only when a real auth user is known.
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    player_key      TEXT        NOT NULL UNIQUE,   -- guest-xxx or real user UUID as text
    user_id         UUID        REFERENCES public.users(id) ON DELETE CASCADE,  -- nullable pre-auth
    display_name    TEXT        NOT NULL,
    time_control    INTEGER     NOT NULL,
    elo             INTEGER     NOT NULL,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT        NOT NULL DEFAULT 'waiting',  -- waiting | matched | cancelled
    matched_game_id UUID        REFERENCES public.games(id) ON DELETE SET NULL,
    opponent_name   TEXT,
    opponent_elo    INTEGER
);

-- ─────────────────────────────────────────────
-- 3. ALTER public.games: add elo change columns
-- ─────────────────────────────────────────────
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS elo_change_p1 INTEGER,
    ADD COLUMN IF NOT EXISTS elo_change_p2 INTEGER;

-- ─────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_time_stats_user_id
    ON public.user_time_stats (user_id);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_status_time_control
    ON public.matchmaking_queue (status, time_control);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_joined_at
    ON public.matchmaking_queue (joined_at);

-- ─────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────

-- user_time_stats --
ALTER TABLE public.user_time_stats ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read all time stats (e.g. for leaderboards)
CREATE POLICY "time_stats_public_read"
    ON public.user_time_stats
    FOR SELECT
    USING (true);

-- Authenticated users can insert/update only their own row
CREATE POLICY "time_stats_owner_write"
    ON public.user_time_stats
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- matchmaking_queue --
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Users can see and manage only their own queue entry
CREATE POLICY "queue_owner_select"
    ON public.matchmaking_queue
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "queue_owner_insert"
    ON public.matchmaking_queue
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "queue_owner_update"
    ON public.matchmaking_queue
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "queue_owner_delete"
    ON public.matchmaking_queue
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- service_role can read the full queue for matchmaking logic
CREATE POLICY "queue_service_role_read"
    ON public.matchmaking_queue
    FOR SELECT
    TO service_role
    USING (true);

-- ─────────────────────────────────────────────
-- 6. Explicit GRANTs on existing tables
--    (ALTER DEFAULT PRIVILEGES only covers future tables)
-- ─────────────────────────────────────────────

-- Public read on core tables
GRANT SELECT ON public.users             TO anon, authenticated;
GRANT SELECT ON public.user_time_stats   TO anon, authenticated;
GRANT SELECT ON public.friendships       TO anon, authenticated;

-- Authenticated users can manage friendships
GRANT INSERT, UPDATE ON public.friendships TO authenticated;

-- Authenticated users can manage their own queue entry
GRANT INSERT, UPDATE, DELETE ON public.matchmaking_queue TO authenticated;

-- service_role gets full access to the queue (for the matchmaking worker)
GRANT ALL ON public.matchmaking_queue TO service_role;
