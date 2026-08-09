-- Starter analytics queries for the Quoridor database.
--
-- These are meant to be pasted into Metabase one at a time: New > SQL query, paste,
-- run, then Save as a question and add it to a dashboard. They are grounded in the
-- real schema (games, game_moves, users).
--
-- Schema caveats worth knowing (see docs/BACKLOG.md and docs/DECISIONS.md):
--   * games.mode is one of pass_and_play, vs_ai, ranked, casual. vs-AI and
--     pass-and-play games may not be persisted at all (they can run client-side), so
--     bot metrics may be empty until those games are recorded.
--   * There is no bot difficulty column, so "bot games per level" is not queryable
--     yet. Add an ai_difficulty column (or emit an event) first.
--   * status is finished or resigned; the win/timeout distinction is not stored.


-- 1. Total decided games
select count(*) as total_games
from games
where status in ('finished', 'resigned');


-- 2. Games by mode
select mode, count(*) as games
from games
where status in ('finished', 'resigned')
group by mode
order by games desc;


-- 3. Games per day (last 30 days)
select date_trunc('day', created_at)::date as day, count(*) as games
from games
where created_at > now() - interval '30 days'
group by 1
order by 1;


-- 4. New users per day (last 30 days)
select date_trunc('day', created_at)::date as day, count(*) as new_users
from users
where created_at > now() - interval '30 days'
group by 1
order by 1;


-- 5. Users total and how many have played
select
  count(*) as total_users,
  count(*) filter (where games_played > 0) as users_with_games
from users;


-- 6. Going-first advantage (player 1 win rate). A balance signal worth watching.
select
  count(*) filter (where winner_index = 0) as p1_wins,
  count(*) filter (where winner_index = 1) as p2_wins,
  round(100.0 * count(*) filter (where winner_index = 0) / nullif(count(*), 0), 1) as p1_win_pct
from games
where status in ('finished', 'resigned') and winner_index is not null;


-- 7. Decided by board win vs resignation
select status, count(*) as games
from games
where status in ('finished', 'resigned')
group by status;


-- 8. Average game length (moves) by mode
select mode, round(avg(coalesce(array_length(move_history, 1), 0)), 1) as avg_moves
from games
where status in ('finished', 'resigned')
group by mode
order by avg_moves desc;


-- 9. Time control popularity (seconds)
select time_control, count(*) as games
from games
where status in ('finished', 'resigned') and time_control is not null
group by time_control
order by games desc;


-- 10. Elo distribution in 100-point buckets (players who have played)
select (elo / 100) * 100 as elo_bucket, count(*) as users
from users
where games_played > 0
group by 1
order by 1;


-- 11. Daily active players (distinct players who appeared in a game that day)
select day, count(distinct player) as active_players
from (
  select date_trunc('day', created_at)::date as day, player1_id as player from games
  union all
  select date_trunc('day', created_at)::date as day, player2_id as player from games
) t
where player is not null
group by day
order by day;


-- 12. Average think time per move, by mode (heavier; from game_moves timestamps).
--     Uses the gap between consecutive moves in the same game as think time.
select
  g.mode,
  round(avg(extract(epoch from (m.played_at - prev.played_at)))::numeric, 1) as avg_seconds_per_move
from game_moves m
join game_moves prev
  on prev.game_id = m.game_id and prev.move_number = m.move_number - 1
join games g on g.id = m.game_id
group by g.mode
order by avg_seconds_per_move desc;


-- ===========================================================================
-- Ground truth and fun extras
-- ===========================================================================

-- 0. RUN THIS FIRST. Shows exactly what is stored, so you know what is answerable.
--    If there are no vs_ai rows, bot games are not persisted (they run client-side)
--    and the bot/difficulty questions need a schema change or event tracking first.
select mode, status, count(*) as games
from games
group by mode, status
order by games desc;


-- 13. Online vs bot vs local vs total, in one row (answers the headline counts)
select
  count(*) filter (where mode in ('ranked', 'casual')) as online_games,
  count(*) filter (where mode = 'vs_ai')               as bot_games,
  count(*) filter (where mode = 'pass_and_play')       as local_games,
  count(*)                                             as total_games
from games
where status in ('finished', 'resigned');


-- 14. Busiest hour of day (UTC). Good as a bar chart.
select extract(hour from created_at) as hour_utc, count(*) as games
from games
group by 1
order by 1;


-- 15. Top players by Elo (swap `username` if your name column differs)
select username, elo, games_played
from users
where games_played > 0
order by elo desc
limit 10;


-- 16. Most active players
select username, games_played, elo
from users
order by games_played desc
limit 10;


-- 17. Biggest upsets: the largest Elo the winner gained (a big gain means they beat a
--     much higher-rated opponent). A fun "hall of fame" list.
select
  id,
  created_at,
  case when winner_index = 0 then elo_change_p1 else elo_change_p2 end as winner_elo_gain
from games
where status in ('finished', 'resigned') and winner_index is not null
order by winner_elo_gain desc nulls last
limit 10;


-- 18. Longest games by move count
select id, mode, coalesce(array_length(move_history, 1), 0) as moves, created_at
from games
where status in ('finished', 'resigned')
order by moves desc
limit 10;
