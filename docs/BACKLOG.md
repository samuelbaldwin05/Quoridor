---
title: Backlog
covers: []
reviewed_at: 0e3abee
---

# Backlog

Open work only. Reasoning and deferral rationale live in [DECISIONS.md](DECISIONS.md);
"how it works" lives in [ARCHITECTURE.md](ARCHITECTURE.md). Severity tags:
[CRIT] [HIGH] [MED] [LOW]. Locations are `path` references; re-grep if they drift.
History of completed work is in git.

Both suites green as of 2026-08-17: backend 397, frontend 393.

## Needs verification (you are here to test)

The 2026-08-06 hardening pass landed the code for the items below but could not confirm
them without a live environment or a human visual check. Until verified they are open.
The prerequisite for the live items is a running stack: `make dev`, then two browsers or
two accounts.

### [CRIT] Live two-client trust-chain smoke test

Every checklist item is pinned in the mocked tier; the live run is the deploy gate. With
two accounts:

1. Full game to a board win: winner Elo up, loser down, both see the result.
2. Out-of-turn or illegal move rejected (4xx on `POST /games/{id}/move`).
3. Resign and timeout: forfeiter loses, opponent gains, overlays correct.
4. Kill one client's network mid-game: reconnecting shows, clock pauses, no phantom
   timeout loss, then it recovers.
5. Retry or double-submit a move or result: idempotent, no duplicate Elo.
6. DevTools forgery: a result claiming a win over a losing history is rejected.

### [HIGH] Realtime private channel (migration 024 + `private: true`)

A wrong Realtime authorization policy silently blocks ALL realtime (moves and presence)
with no error, and only shows up with two live clients. Confirm realtime still flows for
the two participants and is denied to a third party. If it breaks, revert `private: true`
in `frontend/src/hooks/useOnlineGame.ts` and drop the 024 policies together.

What is already checked: the policy logic itself, exercised directly against the database
by setting role, `request.jwt.claims` and `realtime.topic` (participant reads and sends,
authenticated non-participant blocked on both, anon blocked, participant on another game's
topic sees nothing). What is not: that the Realtime server sets those two settings the way
the policies assume, which needs real sockets.

Test with two browsers. Either two dev logins (each is now an anonymous Supabase session,
so they are distinct users with real tokens, which is what the private channel needs) or
two Google accounts. Two dev logins used to be impossible to match, since they shared one
hard-coded user id.

### [MED] Disconnect forfeit, end-to-end

Backend `disconnect` result is turn and liveness guarded (migration 017 `last_move_at`,
12s dwell); the frontend arms a socket-gated 15s grace that a return cancels. Guards and
reject paths are unit-tested; the full two-client flow (drop one client, confirm the
forfeit resolves and a present opponent thinking past the dwell is not robbed) needs a
live check.

### [MED] Visual UX

Check all three on both the online and offline game views:

- Debounced waiting state (`WAITING_DEBOUNCE_MS`): appears only after sustained absence.
- Inline waiting note to the left of the opponent's timer, replacing the full-screen
  overlay, with the Cancel affordance folded in.
- `MoveListPanel` extracted and shared by `GameRightPanel` and `OnlineGamePage`: scroll
  behavior and the move list read correctly in both.

## Mobile

- [MED] Confirm fence aiming is actually fixed on a real phone. The touch target now
  extends `--wall-touch-slop` past the groove into the neighbouring squares, and every
  tap is a proposal (see DECISIONS). What needs a human with a phone: whether the starting
  4px is enough (it takes an 8px groove to 16px, still under a fingertip), whether the
  squares still feel tappable for pawn moves, and whether the proposed-move ring reads
  clearly under a finger. The slop is one CSS variable on `.board`, so tuning it is a
  one-line change.
- [MED] Verify queue expiry on a phone. The hidden-tab grace (60s) ends a search when the
  screen locks or the browser is backgrounded, which is far more common on mobile than on
  a desktop. Confirm the paused message reads sensibly on return and that Search again
  re-queues cleanly. Location: `frontend/src/components/MatchmakingModal.tsx`.
- [MED] Re-check the online game card header on a phone after the row alignment fix
  (fence chip, presence note and clock now share one flex row). Confirm nothing wraps or
  clips with a long opponent name plus a visible "waiting…" note.

## Open follow-ups

- [LOW] Set the refresh token reuse interval to 30s in the hosted project's dashboard
  (Auth, Sessions) to match `supabase/config.toml`. The client now survives a lost rotation
  race by adopting whatever session the other context wrote, so this is the second line of
  defence rather than the fix. Symptom it addresses: signed out on a phone that has both
  the installed app and a browser tab open.


- [HIGH] Two-client check of the rejoin path. Reloading mid-game used to void the game
  for both players; the client now adopts the server's snapshot instead of assuming a
  fresh board. Worth proving by hand: reload mid-game and confirm the board, the side you
  are playing, the opponent's name and both clocks come back, that play continues, and
  that the opponent sees nothing at all. Then the same on a phone by locking the screen.
  Note the restored clocks are the server's, which do not pause while an opponent is
  disconnected, so they can come back lower than the screen showed.
- [HIGH] Confirm unfinalized games actually stopped. The three holes that let a finished
  online game never reach the backend are closed (result POST retries with backoff and
  reports failure; `opponent_timeout` lets the player still watching claim a flag, server
  clock-checked; `cleanup_abandoned_games` retires walked-away games). Two clients are
  needed to prove it: background one tab until its clock passes zero and confirm the
  other resolves the win, and kill the network at the moment of a resign and confirm the
  retry lands it. Then re-run `supabase/snippets/diagnose_missing_game_stats.sql` and
  check no new rows are piling up in `playing`.
- [MED] Server-verified clocks are a reconstruction, not the real thing.
  `games.time_used_p1/p2` count wall-clock per move, while the clients pause on opponent
  disconnect, so the server's figure runs ahead of what a player sees. That is why the
  flag claim needs `FLAG_CLAIM_MARGIN_SECONDS`. A long disconnect could in principle let
  a claim through slightly early, bounded by the margin and by the fact that a
  disconnected opponent is already forfeit territory. Closing it properly means
  server-side presence, which is the item below.
- [MED] Confirm the stats repair landed. Migration 020 restores the `user_time_stats`
  write that 010 dropped and rebuilds both counters from the games ledger. After it
  deploys, check a profile card with real history: per-format games and win rate should
  match the ranked and casual games actually finished, and `users.games_played` should
  equal the sum across formats. Bot games stay excluded by design, so a player whose
  history is mostly vs-AI will still read low.
- [MED] Server-authoritative presence or heartbeat to fully harden the disconnect
  forfeit. The turn and dwell guard is a proxy: it closes the casual tab-close dodge and
  the instant-claim exploit, but a crafted direct API call can still steal a win from a
  present opponent who thinks longer than the dwell (bounded by the 15s client grace).
  Location: `backend/app/services/game_service.py` (result path), `useOnlineGame.ts`.
- [LOW] Commit a source-tracked base grant model. `000_roles.sql` is referenced by
  `supabase/migrations/001_schema.sql` but is absent from the repo, so the base grants
  rely on the Supabase CLI default rather than being reproducible from source. Fold a
  `REVOKE` or `ALTER DEFAULT PRIVILEGES` statement into a migration.
- [LOW] A locally-cached online game opened by its local id still shows the opponent's
  play-time name (client cache only; the server read path now resolves current names).
  Location: `frontend/src/lib/gameStorage.ts` (`SavedGame.playerNames`).

## Features (roadmap)

- MCTS bot: remaining work. The tier is implemented end to end and playable locally (see
  docs/MCTS_INTEGRATION.md). Still open:
  - [HIGH] Add the engine submodule at `backend/vendor/quoridor-mcts` and confirm the
    two-stage image builds the wheel. Until then a deployed backend answers 503 for the tier
    and every move falls back to the browser.
  - [MED] Pick the iteration target from a measured strength curve rather than the current
    placeholder of 8000 (`settings.mcts_target_iterations`). The engine repo's `main_sim`
    already accepts `--max-iters`, so this is a scripted sweep. Note the flag gauntlet in the
    engine repo ran at 800 iterations on 1 thread, an order of magnitude under the shipping
    budget, and `--eval-depth` is the worked example of a result whose sign flips with budget.
    That includes `pw-k 2`, which the app now runs.
  - [MED] Unclaimed wins from that gauntlet: `race_eval` measured +27 Elo and is not in either
    config dict, and `reuse_tree` measured +31.4 but needs per-game server state.
  - [MED] Drive the browser engine end to end. The Embind contract and the worker bundling are
    both verified, but nothing has run a real `new Worker` in a page.
  - [LOW] Multi-threaded WASM needs COOP/COEP headers. Correction to the earlier note that
    Azure Static Web Apps cannot send them: it can, via `globalHeaders` in
    `staticwebapp.config.json`, which the app now has for its own reasons. The reason not to
    is COEP, which blocks every cross-origin resource that does not opt in, and this app
    loads Google's OAuth flow and Supabase over cross-origin requests. So it is a real
    option with a real cost, not an impossibility. Root parallelization is where most of the
    tuned strength came from, so this is still the largest available upgrade to the browser
    path.
  - [LOW] Tree reuse and pondering. `reuse_tree` exists in the engine but needs either
    client-side persistence or server-side per-game state; the endpoint is stateless today.
- Puzzles. The `puzzles` table exists with public-read RLS but is never populated;
  `PuzzlesPage.tsx` shows a static dev-only bank. Remaining: a generation pipeline
  (pull finished online games, find positions with one clearly winning move, estimate
  Elo, persist), backend endpoints, and a daily-puzzle flow with solve tracking.
- Admin dashboard. No admin route or role exists. Internal tooling for monitoring
  games, users, Elo distribution, and flagging abuse. Scope to be decided.
