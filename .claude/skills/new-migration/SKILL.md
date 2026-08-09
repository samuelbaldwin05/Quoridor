---
name: new-migration
description: Use for any database schema change, new table or column, RLS policy, or Postgres RPC under supabase/migrations/. Covers migration numbering, RLS, the service-role RPC pattern, optimistic concurrency, and the auto-apply-on-merge deploy model.
---

# New migration

One-line rule: migrations are forward-only SQL files under `supabase/migrations/`, numbered in strict sequence, and they apply themselves to production the moment they merge to `main`. There is no manual push step in the release path.

## Numbering

Current files run `001_schema.sql` through `010_per_move_authority.sql` (confirm the current highest with `ls supabase/migrations/` before naming yours; do not assume 010 stays the ceiling). Your new file is `011_<short_description>.sql`, following the existing `NNN_description.sql` pattern (snake_case description, for example `009_security_hardening.sql`, `010_per_move_authority.sql`).

## Forward-only

There are no down-migrations in this repo. Write SQL that is safe to apply once, in order, to a database that already has every prior migration applied. If you need to change something a prior migration did, write a new migration that alters it (see how `009_security_hardening.sql` revokes grants and drops a policy that `001`/`003` had created), not a rewrite of the old file.

## RLS on every new table

`supabase/migrations/001_schema.sql` is the reference: every table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, then explicit policies. Patterns already in use there:

- Public read: `CREATE POLICY "puzzles_public_read" ON public.puzzles FOR SELECT USING (true);`
- Owner-only write: `CREATE POLICY "time_stats_owner_write" ON public.user_time_stats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);` (note both `USING` and `WITH CHECK` on a write policy, so a row can't be updated into a shape that no longer matches the check).
- Participant read via a join: `CREATE POLICY "moves_participants_read" ON public.game_moves FOR SELECT USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND (auth.uid() = g.player1_id OR auth.uid() = g.player2_id)));`

One existing gap, so you don't reintroduce it elsewhere: `"users_owner_update"` in `001_schema.sql` has a `USING` clause but no `WITH CHECK`, so it doesn't restrict which columns or values an update can set. It is inert today only because no `UPDATE` grant is given to `authenticated` on `users` (see `docs/DECISIONS.md`, "Deferrals"). If your migration adds an `UPDATE` grant on `users`, add a `WITH CHECK` (and a column guard trigger if needed) at the same time; don't repeat the gap.

## Privileged RPCs: restrict to the service role

Functions that trust caller-supplied state that must not be forgeable by a client (a winner, an Elo delta, a queue match) are `SECURITY DEFINER` and locked to `service_role`. The real pattern, from `010_per_move_authority.sql` (`append_game_move`) and `009_security_hardening.sql`:

```sql
CREATE OR REPLACE FUNCTION public.append_game_move(...)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ ... $$;

REVOKE ALL ON FUNCTION public.append_game_move(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.append_game_move(uuid, text, integer) TO service_role;
```

For a function created in an earlier migration that needs locking down later, `009_security_hardening.sql` shows the retrofit: `REVOKE EXECUTE ON FUNCTION public.submit_game_result(...) FROM authenticated;` (leaving `service_role`'s existing grant from `003_atomic_rpcs.sql` untouched, since `REVOKE` only removes the grant named). The backend calls these with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`); the frontend never calls them directly, and PostgREST's `/rpc` surface should not expose them to `authenticated` or `anon`.

## Optimistic concurrency

`append_game_move` in `010_per_move_authority.sql` is the pattern to copy for "read-modify-write where two callers might race":

1. `SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;`: lock the row first.
2. Check a precondition (`v_game.status <> 'playing'`) and raise with a distinct `ERRCODE` (`'40001'`) that the calling Python code pattern-matches on (see `game_service.submit_move`, which turns a `40001`/"mismatch" message into `ConflictError`, and `P0002`/"not found" into `NotFoundError`).
3. Compare an expected version (here, `p_expected_count`, the move count the caller validated against) to the actual stored value; raise on mismatch rather than blindly overwriting.
4. Only then perform the write.

For multi-row updates that could deadlock (locking two different rows two callers might lock in opposite orders), lock in a deterministic order: `submit_game_result` locks both user rows with `ORDER BY id FOR UPDATE`, and `match_in_queue` locks the caller's own queue row before scanning for an opponent with `FOR UPDATE SKIP LOCKED`, specifically to avoid the cross-row lock cycle described in the `009_security_hardening.sql` header comment.

## Verifying a migration

- `make db-reset` (`supabase db reset`) wipes and rebuilds the **local** stack from every migration plus `supabase/seed.sql`. Never touches production.
- CI: `.github/workflows/test-migrations.yml` starts a local Supabase stack and runs `supabase db reset --no-seed` to confirm every migration applies cleanly to a fresh Postgres, on any push or PR touching `supabase/migrations/**`, `supabase/config.toml`, or `supabase/seed.sql`. Note its own path filter lists `.github/workflows/migrations.yml`, which does not match the actual filename `test-migrations.yml`, so an edit to the workflow file itself will not retrigger this check; a migration change still will.

## Do not add a manual deploy step

Migrations apply to the hosted project automatically on merge to `main`, via the Supabase GitHub integration configured in the Supabase dashboard, not by any workflow in this repo (`docs/DECISIONS.md`, "Migrations apply automatically on merge"; confirmed in `docs/INFRASTRUCTURE.md` by observing 009 and 010 land in `supabase_migrations.schema_migrations` after merge with no manual step). `make migrate` (`supabase db push`) exists only as a manual fallback if you ever need to push from your own machine; it is not part of the required release path, and multiplayer-breaking migrations should land in the same merge as the backend/frontend changes that depend on them (`docs/INFRASTRUCTURE.md`, "Deploy coupling").

## Checklist

- [ ] File named `supabase/migrations/<next-number>_<description>.sql`, one more than the current highest.
- [ ] Forward-only; no down-migration, no rewrite of a prior file.
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus explicit policies on any new table; `WITH CHECK` on any write policy.
- [ ] Any RPC trusting caller-supplied state is `SECURITY DEFINER`, restricted to `service_role` (`REVOKE ... FROM public/authenticated` + `GRANT EXECUTE ... TO service_role`).
- [ ] Concurrent read-modify-write paths use row locks (`FOR UPDATE`) and either an optimistic-concurrency check or a deterministic lock order.
- [ ] `make db-reset` applies cleanly locally.
- [ ] No manual `supabase db push` added anywhere as a required step; merging to `main` is sufficient.
