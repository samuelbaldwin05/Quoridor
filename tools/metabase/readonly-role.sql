-- Create a READ-ONLY Postgres role for Metabase.
--
-- Run this in the Supabase dashboard SQL editor against the PRODUCTION project.
-- Metabase must never connect with the service role or any write-capable user.
--
-- 1. Replace the password below with a strong one.
-- 2. Keep that password out of git; you will type it into the Metabase UI only.

create role metabase_ro with login password 'CHANGE_ME_to_a_strong_password';

grant connect on database postgres to metabase_ro;
grant usage on schema public to metabase_ro;
grant select on all tables in schema public to metabase_ro;

-- Make tables added by future migrations readable too, without re-granting.
alter default privileges in schema public grant select on tables to metabase_ro;

-- Row level security. These tables have RLS enabled, and their policies match rows by
-- auth.uid(), which is null for a plain Postgres role, so a SELECT grant alone returns
-- zero rows. Add a blanket read policy for this role on each table you want to analyze.
-- (bypassrls would be simpler but requires superuser, which Supabase's postgres is not.)
drop policy if exists metabase_ro_read on public.games;
drop policy if exists metabase_ro_read on public.game_moves;
drop policy if exists metabase_ro_read on public.users;
create policy metabase_ro_read on public.games      for select to metabase_ro using (true);
create policy metabase_ro_read on public.game_moves for select to metabase_ro using (true);
create policy metabase_ro_read on public.users      for select to metabase_ro using (true);
-- Add more of the same for challenges, friendships, matchmaking_queue, etc. if you
-- want to chart those too.

-- To revoke access later:
--   drop owned by metabase_ro;
--   drop role metabase_ro;
