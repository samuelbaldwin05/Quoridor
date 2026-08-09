---
name: add-backend-endpoint
description: Use when adding a new backend route or extending an existing one, or any time business logic needs a new service function or a new table/RPC needs a repository function. Covers the routes-to-services-to-repositories layering and where exceptions, schemas, and tests belong.
---

# Add a backend endpoint

One-line rule: routes call services, services call repositories, and nothing skips a layer. `docs/ARCHITECTURE.md` ("Backend layering") and `CLAUDE.md` both state this; this skill walks it end to end against a real feature.

## The worked example: challenges

The challenge feature is a clean instance of every rule below. Read it in this order:

1. `backend/app/schemas/challenge.py`: `ChallengeCreate` (request body: `challenged_id`, `time_control`) and `ChallengeRead` (response: adds enriched fields like `challenger_name`, `challenger_elo`). Create and read are separate models; the create model only has what the client may set.
2. `backend/app/repositories/challenge_repository.py`: the only place that calls `client.table(...)` or `client.rpc(...)` for challenges. `get_my_challenges`, `create_challenge`, `accept_challenge`, `cancel_or_decline_challenge`. Every Supabase call is wrapped in `try/except` and re-raised as a domain exception (`DatabaseError`, `ConflictError` via `_pg_errors.is_unique_violation`, `NotFoundError`, `AuthorizationError`). No bare exception escapes this layer.
3. `backend/app/services/challenge_service.py`: `send`, `accept`, `cancel_or_decline`, `list_mine`. This is where business rules live: `send` raises `ConflictError` if `challenger_id == challenged_id` and `InvalidMoveError` if `time_control` isn't in `ALLOWED_TIME_CONTROLS`. Everything else is a direct delegation to `challenge_repository`. No `Client` methods are called here directly, no `Request`/`Response` objects, nothing HTTP-shaped.
4. `backend/app/api/challenges.py`: the router. Each route: `Depends(get_current_user)` for the caller, `Depends(get_supabase)` for the client, one call into `challenge_service`, return the Pydantic model. No `try/except`, no `HTTPException`, no direct database access. `send_challenge` also shows the rate-limit pattern (`@limiter.limit("30/minute")` from `app.core.rate_limit`).

## Layer rules (what belongs where, what must not)

- **Routes (`backend/app/api/*.py`)**: HTTP only. Parse the request (FastAPI does this via the Pydantic body), call exactly one service function, return its result. Never call a repository or the Supabase client directly. Never raise or catch `HTTPException` for domain errors; let domain exceptions propagate.
- **Services (`backend/app/services/*.py`)**: business logic, validation, orchestration across repositories. No `Request`/`Response`/`HTTPException`. No direct `client.table(...)` or `client.rpc(...)` calls; go through a repository function. Raise domain exceptions from `backend/app/core/exceptions.py` when a rule is violated.
- **Repositories (`backend/app/repositories/*.py`)**: the only layer allowed to call the Supabase client. Return typed Pydantic models (or, where the codebase already deals in raw rows for later shaping, plain dicts consumed only by the owning service, as `game_repository.py` does). Wrap every Supabase call so failures become `DatabaseError` or a more specific domain exception, never a raw Supabase/PostgREST exception.

One real exception to know about: `backend/app/services/game_service.py` (`submit_move`, `record_game_result`) calls `supabase.table(...)` and `supabase.rpc(...)` directly instead of going through `game_repository`. That is the multiplayer per-move and result-finalization authority path (see `docs/ARCHITECTURE.md`, "Multiplayer authority model") and predates strict enforcement of this layering there. Do not copy that shape for a new endpoint; use the challenge feature above as the pattern to follow. If you touch `game_service.py`'s move/result path, match its existing shape rather than half-migrating it.

## Schemas: create vs read vs update

Separate Pydantic models per direction, not one shared model:

- `ChallengeCreate` / `ChallengeRead` in `backend/app/schemas/challenge.py`.
- `GameCreate` / `GameRead` in `backend/app/schemas/game.py` (also see `MoveSubmitRequest` / `MoveSubmitResponse` and `GameResultRequest` / `GameResultResponse` there for the request/response split on action endpoints, not just CRUD).
- `UserRead` / `UserUpdate` / `UserProfile` (the public, email-free view) in `backend/app/schemas/user.py`.

A closed set of allowed values that would otherwise need re-validating downstream should be a `Literal` at the schema boundary: see `TimeControl = Literal[180, 300, 600]` in `backend/app/schemas/game.py`, reused by `GameCreate`, `ChallengeCreate`, and matchmaking's `JoinQueueRequest` (see `docs/DECISIONS.md`, "time_control is a fixed Literal"). Prefer that over re-checking an int range in every service function.

## Exceptions and status mapping

Domain exceptions live in `backend/app/core/exceptions.py`, all subclassing `QuoridorError`: `NotFoundError`, `AuthorizationError`, `ConflictError`, `GameAlreadyFinishedError`, `InvalidMoveError`, `ValidationError`, `CooldownError`, `DatabaseError`. Raise the one that matches the failure; do not raise `HTTPException` from a service or repository.

The mapping to HTTP status lives centrally in `backend/app/api/main.py` (`_STATUS_BY_EXCEPTION`, handled by `quoridor_exception_handler`): `NotFoundError` to 404, `AuthorizationError` to 403, `ConflictError` and `GameAlreadyFinishedError` to 409, `InvalidMoveError` and `ValidationError` to 422, `CooldownError` to 429, `DatabaseError` to 500 (the default for anything unmapped). If your new failure mode doesn't fit an existing exception, add one to `core/exceptions.py` and a line to `_STATUS_BY_EXCEPTION` rather than reusing a mismatched one.

## Tests

Add a mocked test in the unit tier (`docs/ARCHITECTURE.md`, "Testing tiers"; see also `docs/DECISIONS.md`, "Unit tests mock the database at the repository boundary"). No real database, ever, in this tier.

- **Service test**: monkeypatch the repository module's functions and assert the service delegates correctly and raises the right exception for a bad input. See `backend/tests/test_challenge_service.py`: `test_cannot_challenge_yourself`, `test_invalid_time_control_rejected` (parametrized over bad values), and the `TestDelegation` class, which patches `challenge_repository.get_my_challenges` / `accept_challenge` / `cancel_or_decline_challenge` with `monkeypatch.setattr` and asserts the service both calls through with the right arguments and returns the repository's result unchanged.
- **Route test**: `backend/tests/test_api_routes.py` uses `fastapi.testclient.TestClient` against the real `app` from `backend/app/api/main.py`, overriding `get_current_user` and `get_supabase` via `app.dependency_overrides` (see the `client` fixture) so requests run with a fake authenticated user and a `MagicMock` Supabase client. Use this tier to check auth gating, request validation, and response shape (for example that a public profile omits email, per `UserProfile` in `schemas/user.py`).
- `backend/tests/conftest.py` sets dummy `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars via `setdefault` so the app can be imported in CI with no `.env`. You don't need to touch this for a new endpoint; it already applies.

Run `make test-backend` (`uv run pytest`) before considering the change done. If linting matters too, see `run-local-ci`.

## Checklist

- [ ] Request/response Pydantic models added to `backend/app/schemas/`, split by create/read/update as needed.
- [ ] Repository function added if a new table or RPC is touched; it is the only place calling the Supabase client, and every call is wrapped into a domain exception.
- [ ] Service function holds the business logic and calls only the repository, raising domain exceptions from `core/exceptions.py`.
- [ ] Route added to the right `backend/app/api/*.py` router, calling only the service, with no `HTTPException` and no direct DB access.
- [ ] Any new exception type is added to `_STATUS_BY_EXCEPTION` in `backend/app/api/main.py`.
- [ ] A mocked service and/or route test is added under `backend/tests/`.
- [ ] `make test-backend` and `make lint-backend` pass.
