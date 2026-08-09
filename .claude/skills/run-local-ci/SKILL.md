---
name: run-local-ci
description: Use before opening a PR, or whenever asked to run checks, tests, or lint locally. Covers the real make targets for lint and test, what each one actually runs, and how to trace a failure back to the offending layer.
---

# Run local CI

One-line rule: `make ci` is what to run before opening a PR. It needs no Docker and no Supabase stack; everything it runs is mocked or static.

## The targets (from the `Makefile`)

- `make lint-backend` runs `cd backend && uv run ruff check . && uv run ruff format --check .`: ruff lint (rules `E`, `F`, `I`, `UP` per `backend/pyproject.toml`), then a format check with no changes made.
- `make format-backend` runs `uv run ruff check --fix . && uv run ruff format .`, auto-fixing lint and formatting. Not part of CI; run it yourself before committing if `lint-backend` fails on style.
- `make test-backend` runs `cd backend && uv run pytest`: the mocked unit/route suite under `backend/tests/` (see `docs/ARCHITECTURE.md`, "Testing tiers"). No database is touched; `backend/tests/conftest.py` sets dummy `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` so the app can be imported without a `.env`.
- `make lint-frontend` runs `cd frontend && bun run tsc --noEmit && bun run lint && bun run format:check`: three checks in sequence, the TypeScript compiler in strict mode with no output, then ESLint (`bun run lint` runs `eslint .`), then Prettier's check mode (`bun run format:check` runs `prettier --check .`). A failure at the first step (`tsc`) means the other two never run for that invocation.
- `make format-frontend` runs `bun run format` (`prettier --write .`), auto-formatting. Not part of CI.
- `make test-frontend` runs `cd frontend && bun run test:run` (`vitest run`): the Vitest suite, including `frontend/src/engine/__tests__/` and the shared engine-parity corpus.
- `make test` runs `test-backend` then `test-frontend`. No linting.
- `make ci` runs `lint-backend`, `lint-frontend`, `test-backend`, `test-frontend`, in that order. This is the full local equivalent of what CI checks (mirrors `.github/workflows/lint.yml`, `test-backend.yml`, `test-frontend.yml`; it does not run `test-migrations.yml`, which needs a local Supabase stack, see below).

## What `make ci` does not cover

`test-migrations.yml` (starts a local Supabase stack, runs `supabase db reset --no-seed` to confirm every migration applies) and the live two-client multiplayer smoke test (`docs/BACKLOG.md`, "Verify the multiplayer trust chain live") both need the real Supabase stack or a deployed environment. Don't run `make dev`, `make db-reset`, or anything Docker-based just to satisfy a normal PR; those are for migration or multiplayer-authority changes specifically, and are slow and stateful. If your change touches `supabase/migrations/`, see the `new-migration` skill instead.

## Running under Git Bash on Windows

The `Makefile` pins its own shell: on Windows it sets `SHELL := C:/Program Files/Git/bin/bash.exe` (falling back to the `usr/bin` path if the first doesn't exist) and runs with `.SHELLFLAGS := -euo pipefail -c`. This means `make` targets run under Git Bash regardless of what shell invoked `make`, and any failing command in a recipe aborts that recipe immediately (`-e`) rather than continuing. If a `make` target behaves unexpectedly on Windows, confirm Git Bash is actually on `PATH` at one of those two locations before assuming the recipe itself is wrong.

## Reading a failure back to its layer

- `tsc --noEmit` failure inside `lint-frontend`: a type error, not a lint or format issue. Fix the type; ESLint and Prettier won't even have run yet.
- `eslint` failure inside `lint-frontend`: a lint rule violation (unused vars, hook rules, etc.), TypeScript itself was fine.
- `prettier --check` failure inside `lint-frontend`: formatting only; run `make format-frontend` to fix and rerun.
- `ruff check` failure inside `lint-backend`: a lint rule from `select = ["E", "F", "I", "UP"]` in `backend/pyproject.toml` (pyflakes/pycodestyle errors, import sort, pyupgrade). `ruff format --check` failing instead means formatting only; run `make format-backend`.
- `pytest` failure inside `test-backend`: a real behavior regression in a service, route, or engine test, or, if the corpus test fails, an engine-parity issue. See the `engine-parity` skill.
- `vitest run` failure inside `test-frontend`: same, on the frontend side; check whether it's an engine corpus test before assuming it's frontend-only.

## Checklist before opening a PR

- [ ] `make ci` passes locally (or, at minimum, `lint-backend` / `lint-frontend` / `test-backend` / `test-frontend` individually for the sides you touched).
- [ ] If you touched `supabase/migrations/`, also confirm `make db-reset` applies cleanly locally (see `new-migration`).
- [ ] If you touched `frontend/src/engine/` or `backend/app/engine/`, both `test-frontend` and `test-backend` are green, not just the side you edited (see `engine-parity`).
