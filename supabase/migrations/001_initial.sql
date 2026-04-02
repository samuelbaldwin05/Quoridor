-- Users (extends Supabase auth.users)
create table public.users (
    id         uuid primary key,
    email      text not null unique,
    display_name text not null,
    elo        integer not null default 1200,
    games_played integer not null default 0,
    created_at timestamptz not null default now()
);

-- Games
create type public.game_mode as enum ('pass_and_play', 'vs_ai', 'ranked', 'casual');
create type public.game_status as enum ('waiting', 'playing', 'finished', 'resigned');

create table public.games (
    id            uuid primary key default gen_random_uuid(),
    player1_id    uuid references public.users(id),
    player2_id    uuid references public.users(id),
    winner_id     uuid references public.users(id),
    mode          public.game_mode not null,
    status        public.game_status not null default 'waiting',
    time_control  integer,  -- seconds per player, null = untimed
    move_history  text[] not null default '{}',
    created_at    timestamptz not null default now(),
    completed_at  timestamptz
);

-- Puzzles
create table public.puzzles (
    id              uuid primary key default gen_random_uuid(),
    position        jsonb not null,   -- full game state at puzzle start
    solution_move   text not null,    -- algebraic notation of the winning move
    source_game_id  uuid references public.games(id),
    estimated_elo   integer,
    created_at      timestamptz not null default now()
);

-- Friendships
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
    id            uuid primary key default gen_random_uuid(),
    requester_id  uuid not null references public.users(id),
    receiver_id   uuid not null references public.users(id),
    status        public.friendship_status not null default 'pending',
    created_at    timestamptz not null default now(),
    unique (requester_id, receiver_id)
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.games enable row level security;
alter table public.puzzles enable row level security;
alter table public.friendships enable row level security;

-- Users: readable by anyone, writable only by owner
create policy "Users are publicly readable" on public.users
    for select using (true);

create policy "Users can update their own profile" on public.users
    for update using (auth.uid() = id);

-- Games: readable by participants
create policy "Game participants can read their games" on public.games
    for select using (
        auth.uid() = player1_id or auth.uid() = player2_id
    );

-- Puzzles: publicly readable
create policy "Puzzles are publicly readable" on public.puzzles
    for select using (true);
