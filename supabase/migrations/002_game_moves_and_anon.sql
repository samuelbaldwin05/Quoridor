-- Migration 002: proper move storage + allow anonymous/local games

-- Allow games without registered users (local / pre-auth play)
alter table public.games
  alter column player1_id drop not null,
  alter column player2_id drop not null,
  alter column winner_id  drop not null;

-- Add display names for anonymous players (filled in when no user record exists)
alter table public.games
  add column if not exists player1_name text,
  add column if not exists player2_name text,
  add column if not exists winner_index smallint; -- 0 or 1, faster than joining winner_id

-- Replace text[] move_history with a proper per-move table
-- (keep the column for now for backwards compat, add the new table)
create table if not exists public.game_moves (
  id           bigint primary key generated always as identity,
  game_id      uuid not null references public.games(id) on delete cascade,
  move_number  integer not null,          -- 0-indexed order
  player_index smallint not null,         -- 0 = player1, 1 = player2
  move_data    jsonb not null,            -- { kind: 'pawn', to: {row,col} } or { kind: 'wall', wall: {...} }
  played_at    timestamptz not null default now(),
  unique (game_id, move_number)
);

-- Index for fetching all moves for a game in order
create index if not exists game_moves_game_id_idx on public.game_moves(game_id, move_number);

-- RLS for game_moves
alter table public.game_moves enable row level security;

-- Anyone can read moves of games they're a participant in
create policy "Participants can read game moves" on public.game_moves
  for select using (
    exists (
      select 1 from public.games g
      where g.id = game_id
        and (auth.uid() = g.player1_id or auth.uid() = g.player2_id)
    )
  );

-- Participants can insert moves for their own games
create policy "Participants can insert game moves" on public.game_moves
  for insert with check (
    exists (
      select 1 from public.games g
      where g.id = game_id
        and (auth.uid() = g.player1_id or auth.uid() = g.player2_id)
    )
  );

-- Add insert policy for games (currently missing)
create policy "Anyone can create a game" on public.games
  for insert with check (true);

create policy "Participants can update their games" on public.games
  for update using (
    auth.uid() = player1_id or auth.uid() = player2_id
  );
