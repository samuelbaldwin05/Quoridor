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

Both suites green as of 2026-08-06: backend 328, frontend 276.

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

### [HIGH] Realtime private channel (migration 015 + `private: true`)

A wrong Realtime authorization policy silently blocks ALL realtime (moves and presence)
with no error, and only shows up with two live clients. Confirm realtime still flows for
the two participants and is denied to a third party. If it breaks, revert `private: true`
in `frontend/src/hooks/useOnlineGame.ts` and drop the 015 policies together. See DECISIONS.

Test with two real Google accounts, NOT two dev logins. `signInAsDev` in
`frontend/src/hooks/useAuth.ts` sets a local dev token and calls `/auth/me` through
`apiFetch`; it never creates a Supabase Auth session. So the realtime socket connects as
`anon` with `auth.uid()` NULL, and both 015 policies fail on their `TO authenticated`
clause before the participant check is even reached. Under dev auth a private channel is
dead, not degraded, which looks identical to a broken policy. There is also no
`supabase.realtime.setAuth()` call anywhere; that is fine for a real session, since
supabase-js supplies the token from the auth session, but it is the second thing to check
if a real-account test also fails.

Consequence beyond the test: `private: true` makes online play unusable for dev logins.
If dev auth is meant to keep working against a private channel, it needs a genuine
Supabase session (or an explicit `realtime.setAuth()`), which is its own work item.

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

## Open follow-ups

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

- MCTS for stronger AI. Location: `backend/app/api/ai.py` (`time_budget_s` is reserved
  but ignored; dispatch is solely `torch_agent.get_move`). Integrate Monte Carlo Tree
  Search behind a difficulty flag in the `ai/` module.
- Puzzles. The `puzzles` table exists with public-read RLS but is never populated;
  `PuzzlesPage.tsx` shows a static dev-only bank. Remaining: a generation pipeline
  (pull finished online games, find positions with one clearly winning move, estimate
  Elo, persist), backend endpoints, and a daily-puzzle flow with solve tracking.
- Admin dashboard. No admin route or role exists. Internal tooling for monitoring
  games, users, Elo distribution, and flagging abuse. Scope to be decided.
