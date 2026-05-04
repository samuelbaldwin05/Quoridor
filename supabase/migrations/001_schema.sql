-- Full schema: users, games, puzzles, friendships, game_moves,
--              user_time_stats, matchmaking_queue.

-- ─────────────────────────────────────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.users (
    id           uuid        PRIMARY KEY,
    email        text        NOT NULL UNIQUE,
    display_name text        NOT NULL,
    elo          integer     NOT NULL DEFAULT 500,
    games_played integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.game_mode   AS ENUM ('pass_and_play', 'vs_ai', 'ranked', 'casual');
CREATE TYPE public.game_status AS ENUM ('waiting', 'playing', 'finished', 'resigned');

CREATE TABLE public.games (
    id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id      uuid               REFERENCES public.users(id),
    player2_id      uuid               REFERENCES public.users(id),
    winner_id       uuid               REFERENCES public.users(id),
    mode            public.game_mode   NOT NULL,
    status          public.game_status NOT NULL DEFAULT 'waiting',
    time_control    integer,
    move_history    text[]             NOT NULL DEFAULT '{}',
    player1_name    text,
    player2_name    text,
    winner_index    smallint,
    elo_change_p1   integer,
    elo_change_p2   integer,
    created_at      timestamptz        NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

CREATE TABLE public.game_moves (
    id           bigint      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    game_id      uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    move_number  integer     NOT NULL,
    player_index smallint    NOT NULL,
    move_data    jsonb       NOT NULL,
    played_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (game_id, move_number)
);

CREATE TABLE public.puzzles (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    position       jsonb       NOT NULL,
    solution_move  text        NOT NULL,
    source_game_id uuid        REFERENCES public.games(id),
    estimated_elo  integer,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE public.friendships (
    id           uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid                     NOT NULL REFERENCES public.users(id),
    receiver_id  uuid                     NOT NULL REFERENCES public.users(id),
    status       public.friendship_status NOT NULL DEFAULT 'pending',
    created_at   timestamptz              NOT NULL DEFAULT now(),
    UNIQUE (requester_id, receiver_id)
);

CREATE TABLE public.user_time_stats (
    user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    time_control integer     NOT NULL,
    games_played integer     NOT NULL DEFAULT 0,
    wins         integer     NOT NULL DEFAULT 0,
    losses       integer     NOT NULL DEFAULT 0,
    elo          integer     NOT NULL DEFAULT 500,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, time_control)
);

CREATE TABLE public.matchmaking_queue (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    player_key      text        NOT NULL UNIQUE,
    user_id         uuid        REFERENCES public.users(id) ON DELETE CASCADE,
    display_name    text        NOT NULL,
    time_control    integer     NOT NULL,
    elo             integer     NOT NULL,
    joined_at       timestamptz NOT NULL DEFAULT now(),
    status          text        NOT NULL DEFAULT 'waiting',
    matched_game_id uuid        REFERENCES public.games(id) ON DELETE SET NULL,
    opponent_name   text,
    opponent_elo    integer
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX game_moves_game_id_idx                  ON public.game_moves (game_id, move_number);
CREATE INDEX idx_user_time_stats_user_id             ON public.user_time_stats (user_id);
CREATE INDEX idx_matchmaking_queue_status_tc         ON public.matchmaking_queue (status, time_control);
CREATE INDEX idx_matchmaking_queue_joined_at         ON public.matchmaking_queue (joined_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_moves        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_time_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "users_public_read"   ON public.users FOR SELECT USING (true);
CREATE POLICY "users_owner_update"  ON public.users FOR UPDATE USING (auth.uid() = id);

-- games
CREATE POLICY "games_participants_read"   ON public.games FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id);
CREATE POLICY "games_anyone_insert"       ON public.games FOR INSERT WITH CHECK (true);
CREATE POLICY "games_participants_update" ON public.games FOR UPDATE USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- game_moves
CREATE POLICY "moves_participants_read"   ON public.game_moves FOR SELECT USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND (auth.uid() = g.player1_id OR auth.uid() = g.player2_id)));
CREATE POLICY "moves_participants_insert" ON public.game_moves FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND (auth.uid() = g.player1_id OR auth.uid() = g.player2_id)));

-- puzzles
CREATE POLICY "puzzles_public_read" ON public.puzzles FOR SELECT USING (true);

-- friendships
CREATE POLICY "friendships_public_read"  ON public.friendships FOR SELECT USING (true);
CREATE POLICY "friendships_owner_write"  ON public.friendships FOR ALL TO authenticated USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- user_time_stats
CREATE POLICY "time_stats_public_read"  ON public.user_time_stats FOR SELECT USING (true);
CREATE POLICY "time_stats_owner_write"  ON public.user_time_stats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- matchmaking_queue
CREATE POLICY "queue_owner_select"      ON public.matchmaking_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "queue_owner_insert"      ON public.matchmaking_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "queue_owner_update"      ON public.matchmaking_queue FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "queue_owner_delete"      ON public.matchmaking_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "queue_service_role_read" ON public.matchmaking_queue FOR SELECT TO service_role  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit grants (supplement ALTER DEFAULT PRIVILEGES in 000_roles.sql)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT                  ON public.users             TO anon, authenticated;
GRANT SELECT                  ON public.user_time_stats   TO anon, authenticated;
GRANT SELECT                  ON public.friendships       TO anon, authenticated;
GRANT INSERT, UPDATE          ON public.friendships       TO authenticated;
GRANT INSERT, UPDATE, DELETE  ON public.matchmaking_queue TO authenticated;
GRANT ALL                     ON public.matchmaking_queue TO service_role;
