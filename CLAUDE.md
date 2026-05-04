# Quoridor Platform

## Project Overview

A full-featured Quoridor game platform (chess.com-style) with pass-and-play, online multiplayer, Elo ratings, leaderboards, friends, AI opponents, and puzzles.

Monorepo: React/TypeScript frontend, Python/FastAPI backend, Supabase (Postgres + Auth + Realtime).

## Repo Structure

```
quoridor/
  frontend/          # React + Vite + TypeScript
    src/
      components/    # React components
      hooks/         # Custom React hooks
      lib/           # Utilities, API client, types
      engine/        # Game logic (ported from JS, pure functions)
      pages/         # Route-level components
  backend/
    app/
      api/             # FastAPI route modules
      services/        # Business logic layer
      repositories/    # Database access layer
      engine/          # Server-side game logic (Python port, for multiplayer validation)
      ai/              # Model inference code
      models/          # Model weight loading (weights fetched from remote storage, not committed)
      schemas/         # Pydantic models
      core/            # Config, dependencies, exceptions
  supabase/
    migrations/      # SQL migrations
    seed.sql         # Seed data
  CLAUDE.md
```

## Architecture Principles

- Backend is the source of truth for multiplayer games. Client sends moves, backend validates and broadcasts.
- Pass-and-play mode runs entirely client-side using the frontend engine module. No backend required.
- AI inference runs in the backend. Weights are stored in Supabase Storage (or S3), loaded on startup, cached in memory.
- The AI class repo is a separate training/research repo. It produces weight files that are uploaded to storage and consumed by this backend.

## Frontend Conventions

### Stack
- React 18+ with Vite and TypeScript (strict mode)
- Bun as package manager and script runner
- Zod for all runtime validation (API responses, form inputs, URL params)
- TanStack Query for server state
- React Router for routing

### Patterns
- All API responses validated through Zod schemas before use. Never trust raw response shapes.
- Colocate Zod schemas with the API client functions that use them in `lib/api/`.
- Components receive typed props. No `any` types anywhere.
- Game state managed via useReducer for complex state transitions (board, turns, walls, clock).
- Keep game engine logic in `engine/` as pure TypeScript functions with no React dependencies. Components import from engine, engine never imports from components.
- Use custom hooks to encapsulate stateful logic (useGame, useTimer, useBoardInteraction).
- Prefer named exports over default exports.

### File Naming
- Components: PascalCase (`GameBoard.tsx`)
- Hooks: camelCase with `use` prefix (`useGame.ts`)
- Utilities/types: camelCase (`gameTypes.ts`, `apiClient.ts`)

### Error Handling
- API errors wrapped in a typed `QueryError` class with status code, message, and optional field errors.
- Components display errors through a consistent error boundary and toast pattern.

## Backend Conventions

### Stack
- Python 3.12+, FastAPI, Pydantic v2
- uv for dependency management
- Supabase Python client for database and auth
- ruff for linting and formatting

### Layered Architecture
Strict separation: routes → services → repositories. No skipping layers.

- **Routes (`api/`)**: HTTP concerns only. Parse request, call service, return response. No business logic. No direct database access.
- **Services (`services/`)**: Business logic. Orchestrates repositories, performs validation, computes Elo, runs game logic. No HTTP concerns (no Request/Response objects). No direct database access.
- **Repositories (`repositories/`)**: Database access only. Raw queries and Supabase client calls. Returns typed Pydantic models. No business logic.

### Pydantic Models (`schemas/`)
- All request bodies, response bodies, and internal data transfer use Pydantic models. No raw dicts crossing layer boundaries.
- Separate schemas for create vs read vs update (e.g., `GameCreate`, `GameRead`, `GameUpdate`).
- Use `model_validator` and `field_validator` for complex validation.

### Error Handling
- Define custom exception classes in `core/exceptions.py` (e.g., `NotFoundError`, `InvalidMoveError`, `AuthorizationError`).
- Services raise domain exceptions. Routes catch them via FastAPI exception handlers that map to HTTP status codes.
- Never return raw 500s. All expected error cases have explicit handlers.

### Naming
- Files: snake_case (`game_service.py`, `user_repository.py`)
- Classes: PascalCase (`GameService`, `UserRepository`)
- Route functions: snake_case descriptive verbs (`create_game`, `get_leaderboard`)

## Game Engine

### Board Representation
- 9x9 grid for pawn positions
- Walls represented as a set of (row, col, orientation) tuples where orientation is "h" or "v"
- Each wall occupies the groove between four squares

### Notation
Use modern algebraic notation: columns a-i left to right, rows 1-9 bottom to top. Pawn moves are the destination square (e.g., `e2`). Wall moves are the closest square to a1 plus orientation (e.g., `e3v`).

### Validation Rules
A move is valid if:
- Pawn move: destination is orthogonally adjacent (or a valid jump), not blocked by a wall, not occupied
- Wall placement: wall does not overlap existing walls, does not completely block any player's path to their goal row (BFS/DFS pathfinding check required), player has walls remaining
- Path validation is mandatory on every wall placement. Use BFS from each pawn to their goal row.

### Frontend Engine
Pure TypeScript functions. No side effects, no DOM access. Takes game state in, returns new game state out. Example:

```typescript
function validateMove(state: GameState, move: Move): MoveResult
function applyMove(state: GameState, move: Move): GameState
function getValidMoves(state: GameState): Move[]
function checkWin(state: GameState): Player | null
```

### Backend Engine
Python port of the same logic for server-side validation in multiplayer. Must produce identical results to the frontend engine for the same inputs. Any bug fix or rule change must be applied to both.

## Supabase Schema (Target)

Core tables:
- `users` (id, email, display_name, elo, games_played, created_at)
- `games` (id, player1_id, player2_id, winner_id, mode, time_control, move_history, status, created_at, completed_at)
- `puzzles` (id, position, solution_move, source_game_id, estimated_elo, created_at)
- `friendships` (id, requester_id, receiver_id, status, created_at)

Use Supabase Row Level Security (RLS) policies. Users can only read their own data and public leaderboard data.

## AI Integration

- Trained model weights stored in Supabase Storage or S3. Never committed to git.
- `ai/` module exposes a simple interface: `get_ai_move(state: GameState, difficulty: str) -> Move`
- If inference is slow (tree search), use FastAPI background tasks or an async job queue.
- Difficulty levels map to different models, search depths, or temperature settings.

## Implementation Phases

1. **React refactor** — Port vanilla JS/HTML to React/TypeScript. Board rendering, wall placement, pawn movement. Frontend engine module. No backend.
2. **Pass and play** — Two-player local mode. Turn management, timer component, game-over detection. Still frontend only.
3. **Backend + auth** — FastAPI scaffold, Supabase integration, Google OAuth. Game result storage. User profiles.
4. **Multiplayer + Elo** — Supabase Realtime or WebSockets. Server-side move validation (Python engine port). Elo calculation. Leaderboards.
5. **Friends** — Friend requests, online status, challenge a friend. Schema additions, new endpoints, frontend UI.
6. **AI opponents** — Load trained model, expose play-vs-AI mode. Difficulty levels.
7. **Puzzles** — Pipeline: pull stored games, identify positions with one clearly winning move, store as puzzles with estimated difficulty.

## Commit Conventions

- Prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Scope optional: `feat(frontend): add board component`, `fix(backend): elo calculation off-by-one`
- Keep commits atomic. One logical change per commit.