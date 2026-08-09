---
title: Decisions
covers: []
reviewed_at: 0e3abee
---

# Decisions

Why things are the way they are: settled choices and deferrals, so they are not
re-litigated or re-discovered. Append-only in spirit; when a decision is reversed, add
a new entry rather than editing the old one. Open work is in [BACKLOG.md](BACKLOG.md).

## Multiplayer is server-authoritative

The server, not the client, decides every move and outcome. A win is confirmed by the
backend replaying its own stored history; moves are validated server-side before being
accepted; a resign or timeout records the caller as the loser. Delivered in two phases:
Phase A made results outcome-authoritative, Phase B added per-move authority (`POST
/games/{id}/move`, the `append_game_move` optimistic-concurrency RPC in migration 010).

Why: a client cannot be trusted in a ranked, Elo-affecting game. Anything the client
asserts (its move history, who won) must be verifiable by the server or it is a forgery
vector. This is the whole point of the multiplayer work.

## Bot (vs-AI) games are history-only and accept client-reported data

Single-player bot games are persisted to `games` (mode `vs_ai`, `player1_id` = the
user, `player2_id` NULL, plus the new nullable `ai_difficulty` column) via
`POST /games/bot`. That path is deliberately the opposite of the ranked one: it does
NOT validate the reported result or move history, and it never touches Elo, ranked
stats, leaderboards, or `games_played`. The endpoint trusts the client's move history,
chosen difficulty, and who won, all tied to the authenticated user as player1.

Why: there is no opponent and nothing is at stake, so the server-authoritative
machinery (replay, winner proof, the optimistic-concurrency append) buys nothing here.
The worst case is a user fabricating their own single-player history, which is harmless.
Bot games are excluded from `list_finished_games_for_user`, so they never appear in the
public ranked-history list or skew its Elo/opponent columns; the frontend still shows
them from local storage.

The write is idempotent on a client-supplied `client_game_id` (the local `SavedGame`
id, unique per player via a partial index): the endpoint no-ops and returns the stored
row on a duplicate, so the one-time login backfill (`syncPendingBotGames`) can re-send
safely. Games are saved locally first and uploaded opportunistically on finish; a
guest's games upload on their next login. See migration 011.

## Realtime channel is left public for now

The Supabase Realtime channel is not private and has no authorization policy.

Why: once the backend became authoritative over moves and results, a forged broadcast
can no longer fabricate a ranked outcome, so this dropped from a forgery risk to a
grief/desync one. Making it private requires a Realtime authorization policy, and a
wrong policy silently blocks all realtime traffic, so it must be verified against a
live environment before shipping. Left off in code with an inline marker until then.
The flip is tracked in BACKLOG.

## JWT issuer verification is opt-in, not derived from the Supabase URL

Audience (`authenticated`) is always verified. Issuer verification is opt-in via
`SUPABASE_JWT_ISSUER` and left unset by default.

Why: deriving the issuer from `SUPABASE_URL` breaks in Docker, where that URL is the
internal kong hostname, which never matches the token's external issuer and 401s every
login. This was caught in a live test. To scope tokens to the project in production,
set `SUPABASE_JWT_ISSUER=https://<ref>.supabase.co/auth/v1` explicitly.

## Rate limiter keys on the JWT subject

The limiter keys on the JWT `sub`, not the raw token.

Why: it tracks a user across token rotation and never stores the raw token. The
username change endpoint is also rate limited.

## time_control is a fixed Literal

`time_control` is `Literal[180, 300, 600]` shared across `GameCreate`,
`ChallengeCreate`, and `JoinQueueRequest` (defined as `TimeControl` in
`schemas/game.py`). Why: the set of supported time controls is closed, so validation
should reject anything else at the schema boundary rather than downstream.

## Unit tests mock the database at the repository boundary

Service and route tests mock the DB and never connect.

Why: the logic worth protecting (validation, auth gating, exception mapping, Elo, the
engine, move authority) lives above the database. Mocking there makes those tests fast,
deterministic, and able to assert things like "a forged winning result is rejected"
without seeding a database. Database correctness (schema, RLS, RPC concurrency) is
covered by the separate migration workflow and the live smoke test instead. Pointing
these tests at a real Supabase would add flakiness and secret/cleanup burden for no
gain. See ARCHITECTURE "Testing tiers".

## Elo clamp tests use boundary-equal ratings

The floor and ceiling clamp tests use equal ratings at the boundary
(`ELO_MAX, ELO_MAX` and `ELO_MIN, ELO_MIN`) and assert both returned ratings.

Why: the original extreme-gap inputs rounded both deltas to zero, so nothing was
actually clamped and a swapped clamp would pass. Boundary-equal ratings make the clamp
genuinely engage (the winner overflows, the loser underflows) while the other side
provably moves.

## Deferrals

These are intentionally not done, with the reason, so they are not repeatedly
rediscovered as "missing."

- Repository-layer tests. Deferred as low-value and brittle: the repositories are thin
  wrappers, the mock-chain tests are fragile, and service and route tests already
  exercise them indirectly. Do only to pin repo logic (challenge filtering, friend
  mapping, `DatabaseError` wrapping) directly.
- `MoveListPanel` extraction (the `OnlineGamePage` / `GameRightPanel` duplication).
  Deferred: a pure UI refactor with real scroll and behavior regression surface and no
  visual test. The shared helpers are already extracted; the two panels intentionally
  diverged. Do it with a live visual check. Not a bug.
- Dropping `user_time_stats.elo`. Deferred: removing the dead column forces rewriting
  24 seeded rows and the `ON CONFLICT` clause in `seed.sql`, which is error-prone for a
  cosmetic gain. `users.elo` is the single source of truth.
- `users_owner_update` column lock. Deferred: inert today because no UPDATE is granted
  to authenticated users. A column-guard trigger only matters if a future UPDATE grant
  is added; do it then, before granting.

## Migrations apply automatically on merge

Recorded because it was non-obvious and cost investigation: migrations are applied to
the hosted project automatically on merge to `main` via the Supabase GitHub
integration, not by any GitHub Actions workflow. Do not add a manual `supabase db push`
as a required release step. Detail in [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

## Open design question: disconnect forfeit authority

The planned "auto-resign after ~15s of opponent disconnect" (in BACKLOG) is not a
pure frontend change. The backend currently lets a caller report only their own loss.
Recording the absent player's forfeit needs server-side authority (a presence/timeout
check, or a validated disconnect-forfeit), otherwise the present client could assert a
win. Resolve this when implementing the item.

## Disconnect forfeit is a turn-guarded server-authoritative result (resolves the above)

`record_game_result` gained a `reason = "disconnect"` path (schemas/game.py,
game_service.py). Unlike resign/timeout (caller loses), a disconnect claim awards the
CALLER the win, subject to TWO server-side checks against authoritative state:

1. Turn guard: replaying the stored move history must show it is the OPPONENT's turn (the
   caller has made their move and the absent player owes the next one).
2. Liveness guard: `games.last_move_at` (added in migration 017, stamped by
   append_game_move on every move) must be at least `DISCONNECT_FORFEIT_MIN_SECONDS` (12s)
   old. Turn ownership alone is NOT evidence of absence — it is the opponent's turn during
   normal play right after the caller moves — so without the dwell requirement a losing
   player could move and instantly claim a free win. A present opponent who moves within
   the window resets last_move_at and cancels the claim.

The frontend (OnlineGamePage) arms a 15s grace when the opponent's presence drops mid-game
and it is their turn (and only while our own socket is healthy); a reconnect within the
window cancels it. Mid-game a player may still move when the opponent has dropped (isMyTurn
allows it once moves exist), which flips the turn and lets the forfeit resolve rather than
freezing the board when the opponent leaves on our turn.

Why not full presence authority: the backend has no Realtime presence signal, so it cannot
independently confirm a disconnect. Turn + dwell is the strongest server-side proxy
available without presence/heartbeat tracking, but it is a PROXY, so two residual
anti-cheat gaps remain and this feature is DONE-UNVERIFIED, not shippable-as-safe:

- Thinking vs absence: move-recency cannot tell a genuinely-absent opponent from one who
  is simply deliberating longer than the dwell. Honest clients are protected — the
  frontend only fires the forfeit after the Realtime presence signal shows the opponent
  actually left the channel for 15s — but a cheater crafting the result request directly
  can still steal a win from a PRESENT opponent who happens to take longer than the dwell
  on the turn after the cheater moved. The dwell also cannot be raised past the 15s client
  grace without rejecting legitimate claims, so it cannot be widened to a "surely
  abandoned" window.
- Clock domains: last_move_at is stamped with the database `now()` while the dwell is
  computed with the app host's clock, so large clock skew could distort the window (NTP
  normally bounds this to sub-second).

The real fix is server-tracked presence/heartbeat authority (or per-move server clocks),
recorded as a follow-up in BACKLOG. Until then treat the disconnect forfeit as a
convenience that closes the casual tab-close dodge, not as a hardened anti-cheat control.
The guards and their rejection paths are pinned by unit and route tests; the end-to-end
behavior needs a live two-client test.

## Realtime game channel is now private (reverses "left public for now")

Reverses the earlier "Realtime channel is left public for now." The channel is opened
with `private: true` (useOnlineGame.ts) and migration 015 adds Realtime authorization
policies on `realtime.messages` restricting topic `game:{id}` to its two participants.

Why now: it closes the remaining grief/desync/eavesdrop vector. WARNING: this is
UNVERIFIED. A wrong Realtime policy silently blocks ALL realtime with no error, and that
only surfaces with two live clients. The migration was written against the live realtime
schema so it APPLIES cleanly, but "realtime still flows for participants and is denied to
others" has NOT been confirmed end to end. Do not treat the private flip as shippable
until a two-client smoke test passes; if realtime breaks, revert `private: true` and drop
the 015 policies together (they are coupled).

## Privileged RPCs and client table writes are locked down (new hardening)

Audit finding, fixed in migrations 012 and 016. Verified against the running local stack:
Supabase's default grants gave `anon`/`authenticated` EXECUTE on every SECURITY DEFINER
RPC and INSERT/UPDATE/DELETE on every table. The earlier revokes (009 `FROM authenticated`,
010 `FROM public`) missed the `anon` grant, so `submit_game_result`, `accept_challenge`,
`match_in_queue`, `append_game_move`, and the challenge-cleanup functions stayed callable
by clients — a client could finalize its own ranked game as winner. 012 revokes execute
from public/anon/authenticated and grants it only to `service_role` (the backend's role;
the frontend makes no `.rpc()` calls). 016 drops the unused client write policies on
`games`/`challenges`/`friendships`/`matchmaking_queue`, since the frontend only reads
those tables and all writes go through the service-role backend; this also closes a
`move_history` forgery path into the anti-cheat model (a client could directly UPDATE its
own game row). Client writes are now RLS-denied while service-role/RPC writes are
unaffected (verified locally).

## users protected columns are locked (reverses the users_owner_update deferral)

Reverses "users_owner_update column lock — deferred, inert because no UPDATE is granted."
Verified against the live stack: `authenticated` DOES hold UPDATE on `public.users`
(Supabase default), so `users_owner_update` (no WITH CHECK) let a client PATCH its own
`elo`/`games_played` directly — a real Elo-forgery vector, not inert. Migration 013 adds
a BEFORE UPDATE trigger that blocks a real end-user (auth.uid() = the row) from changing
elo/games_played/id/email/created_at, while service-role / SECURITY DEFINER writes
(auth.uid() IS NULL) — the legitimate Elo path — are unaffected, plus an explicit
WITH CHECK on the policy. Verified locally: a client Elo write is rejected, a service-role
Elo write and a client display-name change both succeed.

## user_time_stats.elo dropped (reverses the deferral)

Reverses "dropping user_time_stats.elo — deferred." Migration 014 drops the dead column
and seed.sql is rewritten to stop inserting it (24 rows + the ON CONFLICT clause).
`users.elo` remains the single source of truth. Verified: `supabase db reset` applies all
migrations and reseeds cleanly with the column gone.

## MoveListPanel extracted (reverses the deferral)

Reverses "MoveListPanel extraction — deferred." The duplicated Moves panel (list +
back/forward/settings/resign controls, auto-scroll) is now a shared
`components/MoveListPanel.tsx` used by both `GameRightPanel` (offline) and
`OnlineGamePage` (online); callers pass their own `playerLabel`. Markup and CSS classes
are preserved verbatim. UNVERIFIED: pure UI with scroll/nav behavior and no visual test,
so it needs a human visual check on both game views.

## Repository-layer tests added for the new logic (partial reversal)

The repository-tests deferral stands for the thin CRUD wrappers, but the read-time name
resolution added this round (`_attach_current_names`) carries real branching, so it is
pinned directly in `backend/tests/test_game_repository.py` along with the bot-game lookup.
