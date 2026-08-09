---
title: Architecture
covers:
  - backend/app
  - frontend/src/engine
  - supabase/migrations
reviewed_at: 0e3abee
---

# Architecture

How the Quoridor platform is put together. This is the "how it works" reference.
For deploy and CI see [INFRASTRUCTURE.md](INFRASTRUCTURE.md); for open work see
[BACKLOG.md](BACKLOG.md); for the reasoning behind choices see [DECISIONS.md](DECISIONS.md).

## Overview

A chess.com-style Quoridor platform: pass-and-play, online multiplayer with Elo,
leaderboards, friends, AI opponents, and puzzles. Monorepo with a React/TypeScript
frontend, a Python/FastAPI backend, and Supabase (Postgres, Auth, Realtime).

The backend is the source of truth for online games. Pass-and-play runs entirely
client-side on the frontend engine and needs no backend.

## Repo layout

```
frontend/   React + Vite + TypeScript
  src/
    components/  React components
    hooks/       stateful logic (useReducer game state, timers, board interaction)
    lib/         API client, Zod schemas, types, storage utils
    engine/      pure game logic (no React), mirrored by the backend engine
    pages/       route-level components
    ai/          client-side bots + coordinator
backend/    Python + FastAPI + Pydantic v2 (uv)
  app/
    api/           routes: HTTP only, no business logic, no DB access
    services/      business logic; orchestrates repositories
    repositories/  database access only (Supabase client)
    engine/        Python port of the game logic (multiplayer validation)
    ai/            model inference
    schemas/       Pydantic models
    core/          config, auth, dependencies, exceptions, rate limiting
supabase/
  migrations/   SQL migrations (001..017)
  seed.sql
```

## Backend layering

Strict one-way dependency: routes to services to repositories, no skipping.

- Routes (`api/`) are HTTP only. They parse the request, call a service, and return
  a response. They do not touch the database, raise `HTTPException`, or return raw
  dicts. Domain exceptions map to status codes centrally in `main.py`.
- Services (`services/`) hold business logic: Elo, game validation, username rules,
  profile and leaderboard assembly. No HTTP objects, no direct DB access.
- Repositories (`repositories/`) are the only layer that talks to Supabase. They
  return Pydantic models and raise `DatabaseError` rather than leaking raw failures.

Domain exceptions live in `core/exceptions.py` (`NotFoundError` to 404,
`AuthorizationError` to 403, `ValidationError` to 422, `CooldownError` to 429,
`ConflictError` to 409).

## Data model

Postgres via Supabase, with Row Level Security. Core tables:

- `users` (id, email, display_name, elo, games_played, timestamps)
- `games` (players, winner, mode, time_control, move_history, status, timestamps)
- `friendships` (requester, receiver, status) with an unordered-pair unique index
- `matchmaking_queue`
- `puzzles` (position, solution, source game, estimated elo)
- `user_time_stats` (per-format stats; the dead `elo` column was dropped in migration
  014, `users.elo` is the single rating)

RLS: users read their own data and public leaderboard data. All writes go through the
service-role backend or SECURITY DEFINER RPCs, so direct client writes are locked down:
migration 012 restricts every privileged RPC to the service role (the earlier revokes
missed the Supabase-default `anon` grant), 016 removes the unused client write policies on
`games`/`challenges`/`friendships`/`matchmaking_queue`, and 013 adds a column-guard
trigger so a client cannot change its own `users.elo`/`games_played`. See DECISIONS.

## Game engine

A 9x9 board for pawns. Walls are `(row, col, orientation)` where orientation is `h`
or `v`, each occupying the groove between four squares.

Notation is modern algebraic: columns `a` to `i` left to right, rows `1` to `9`
bottom to top. A pawn move is its destination (`e2`); a wall is the square closest to
`a1` plus orientation (`e3v`).

A move is valid when:

- Pawn: the destination is an adjacent square or a legal jump, not blocked by a wall,
  not occupied.
- Wall: it does not overlap an existing wall, the player has walls left, and it does
  not fully block either player's path to their goal row. The path check is mandatory
  on every wall placement, run as a BFS from each pawn to its goal row.

The frontend engine is pure TypeScript (no side effects, no DOM). Components import
from the engine; the engine never imports from components.

## Engine parity (critical invariant)

The frontend TypeScript engine and the backend Python engine must produce identical
results for identical inputs. Any rule change or bug fix must land in both. This is
enforced by a shared parity corpus, `tests/fixtures/engine_cases.json`, consumed by
both `frontend/src/engine/__tests__` and `backend/tests/test_engine.py`. Treat a
parity divergence as a release blocker.

## Multiplayer authority model

The server, not the client, decides outcomes. This is the anti-cheat core.

- Every move is submitted to `POST /games/{id}/move`. `game_service.submit_move`
  replays the stored history, confirms it is the caller's turn, validates the move
  with the Python engine, and appends it through the `append_game_move` RPC, which
  uses optimistic concurrency (migration 010).
- Results are server-resolved. The result endpoint replays the server's stored
  history; a win is confirmed against that record, a resign or timeout records the
  caller as the loser, and a `disconnect` claim awards the caller the win only if the
  replay shows it is the opponent's turn (turn-guarded, so it is not a bare assertion).
- The frontend is confirm-then-apply: a move is sent to the backend and only applied
  locally and broadcast once the backend accepts it. A double-submit guard prevents
  duplicates.
- Supabase Realtime is used for broadcast and presence only, not as a source of truth.
  The channel is now private (`private: true`) with authorization policies on
  `realtime.messages` (migration 015) restricting topic `game:{id}` to its two
  participants. This is DONE-UNVERIFIED: a wrong policy silently blocks all realtime, so
  the private flip needs a live two-client smoke test. See DECISIONS.
- Reconnect uses capped exponential backoff; the clock pauses while the opponent is
  disconnected; an illegal received move aborts both clients so they converge.

## Frontend

React 18 with Vite and TypeScript in strict mode, Bun as package manager and runner.
Backend calls go through a single `apiFetch<T>` helper in `lib/api.ts`, with response
shapes typed as colocated interfaces; there is no runtime response validation today. Zod
is used for persisted `localStorage` data (settings, saved games), not for API responses.
React Router handles routing, and `App.tsx` wraps the tree in a TanStack Query
`QueryClientProvider`, though backend calls currently use `useState`/`useEffect` rather
than query hooks. Complex game state (board, turns, walls, clock) is a `useReducer`.
Named exports are preferred. No `any`. (CLAUDE.md describes a Zod/`QueryError`/TanStack
Query target that the code has not adopted yet; this section describes the current code.)

## AI

The `ai/` modules expose bot opponents. The backend `ai/` runs model inference
(`torch_agent`); difficulty maps to different models or settings. Weights are not
committed to git. See INFRASTRUCTURE for where weights are stored and loaded, and
BACKLOG for the planned MCTS addition.

## Testing tiers

Two deliberate tiers:

- Mocked unit and route tests. Services and routes are tested with the database
  mocked at the repository boundary, so they are fast and deterministic. They verify
  wiring, auth gating, exception-to-status mapping, request validation, response
  shape (for example the public profile omitting email), and business logic. They do
  not connect to a database.
- Real-database checks. `test-migrations.yml` starts a local Supabase stack in CI and
  applies every migration against a real Postgres. End-to-end multiplayer behavior
  (RPCs, locks, RLS) is verified by the live two-client smoke test, which is the
  deploy gate for the multiplayer work.

`make test` runs the backend (pytest) and frontend (Vitest) suites. See DECISIONS for
why the unit tier mocks the database.
