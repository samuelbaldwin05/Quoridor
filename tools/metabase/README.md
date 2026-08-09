# Metabase (analytics test harness)

A throwaway-friendly Metabase instance for exploring the Quoridor database. It runs
locally in Docker and connects to the production Supabase database with a read-only
role. No secrets live in this folder; the database connection is entered in Metabase's
web UI.

## 1. Start Metabase

From this directory:

```
docker compose up -d
```

Wait for it to boot (first start takes a minute), then open http://localhost:3000 and
create the local admin account. This account is Metabase's own login, unrelated to the
app.

## 2. Create the read-only database role

Metabase must never connect with the service role. In the Supabase dashboard SQL
editor (production project), run `readonly-role.sql` from this folder after replacing
the placeholder password. It creates `metabase_ro` with SELECT-only access.

## 3. Connect Metabase to Supabase

In Metabase: Settings > Admin settings > Databases > Add database > PostgreSQL. Fill in
the values from the Supabase dashboard (Project Settings > Database):

- Host: the database host shown by Supabase (for the direct connection this is
  `db.<project-ref>.supabase.co`).
- Port: `5432`.
- Database name: `postgres`.
- Username: `metabase_ro` (for the pooled connection Supabase expects the form
  `metabase_ro.<project-ref>`; the exact string is shown in the dashboard).
- Password: the one you set in `readonly-role.sql`.
- Use a secure connection (SSL): on. Supabase requires SSL.

Save. Metabase will scan the schema, after which the tables are browsable.

## 4. Add the starter questions

Open `queries.sql`. For each block: New > SQL query, paste it, run it, then Save as a
question and pin it to a dashboard. Start with a few (games per day, games by mode,
Elo distribution, player-1 win rate) to get a feel for it.

## Notes and limits

- Read-only, and keep it local. If you ever deploy this, switch Metabase's app database
  from H2 to Postgres and put it behind auth and IP restrictions, since it holds a
  connection into production.
- Never paste the database password or the service key anywhere public.
- Some metrics need schema changes before they work: bot games per level (no
  `ai_difficulty` column, and vs-AI games may not be persisted) and the
  win/resign/timeout split (no `reason` column). See `docs/BACKLOG.md`.
- To stop: `docker compose down`. Your dashboards persist in the `metabase-data`
  volume. To wipe everything: `docker compose down -v`.
