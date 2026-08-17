---
title: Infrastructure
covers:
  - .github/workflows
  - Makefile
  - supabase/config.toml
  - backend/app/core/config.py
  - backend/Dockerfile
reviewed_at: 0e3abee
---

# Infrastructure

Deploy, CI, database, and local development. For how the system is built see
[ARCHITECTURE.md](ARCHITECTURE.md).

> Open questions are marked `TODO(confirm)`. These are facts I could not verify from
> the repo alone; fill them in and drop the marker.

## Environments

- Local development runs the full stack in Docker via the Supabase local dev stack
  (`http://localhost:54321`). Started with `make dev`.
- Production: the frontend is on Azure Static Web Apps, the backend is an Azure
  Container App, and the database is a hosted Supabase project.
  - Frontend URL: `TODO(confirm)`
  - Backend URL: `TODO(confirm)`
  - Supabase project ref: `ogflmuxjthyvzflcjijx` (API base `https://ogflmuxjthyvzflcjijx.supabase.co`, direct DB host `db.ogflmuxjthyvzflcjijx.supabase.co`)

## Frontend deploy

Workflow: `.github/workflows/azure-static-web-apps-yellow-sand-062e4010f.yml`.

- Triggers on push to `main` and on pull requests targeting `main`.
- `build_and_deploy_job` builds `./frontend` (output `dist`) and uploads to Azure
  Static Web Apps. On a PR it creates a per-PR preview environment.
- `close_pull_request_job` runs only when a PR closes, tearing down that PR's preview.
  It is skipped on every other event by design.
- Build-time env (from repo secrets): `VITE_ENVIRONMENT=production`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`.

## Backend deploy

Workflow: `.github/workflows/deploy-backend.yml`.

- Triggers on push to `main` when `backend/**` (or the workflow) changes, and on
  manual dispatch.
- Builds the backend Docker image, pushes it to GHCR
  (`ghcr.io/samuelbaldwin05/quoridor-backend`), then updates the Azure Container App
  `quoridor-backend` in resource group `quoridor-rg` to the new image.
- Checks out submodules, because the image's first stage compiles the C++ MCTS engine from
  `backend/vendor/quoridor-mcts` into a wheel. The short commit of that submodule is passed
  in as the `QMCTS_COMMIT` build arg and ends up reported by `GET /api/ai/engines`.
- The engine is an optional dependency. With the submodule absent the image still builds, and
  the MCTS bot tier answers 503 so clients search in the browser instead. To install it for
  local development: `uv pip install ./vendor/quoridor-mcts` from `backend/`.
- The MCTS tier spends real CPU per move (roughly a second, bounded by its own search pool),
  so the Container App wants at least two vCPU and a minimum of one replica. Sizing is set
  through `az containerapp`, not from this repo.
- This workflow does not touch the database.

## Database and migrations

Migrations live in `supabase/migrations/` (001 to 018).

- Migrations are applied to the hosted project AUTOMATICALLY on merge to `main` via
  Supabase's GitHub integration (configured in the Supabase dashboard, not in this
  repo). Confirmed 2026-07-30: 009 and 010 appeared in
  `supabase_migrations.schema_migrations` after merge with no manual step.
- `make migrate` (`supabase db push`) is the manual fallback if you ever need to apply
  from your machine. It requires the CLI logged in and linked.
- `make db-reset` (`supabase db reset`) is LOCAL only: it wipes and rebuilds the local
  stack and reseeds it. It never touches production.
- To verify a migration landed on prod, query `supabase_migrations.schema_migrations`
  or the object it creates (for example `select proname from pg_proc where proname =
  'append_game_move'`).

Deploy coupling: the multiplayer work is a breaking change. Backend, frontend, and
migrations 009 and 010 must be live together. Because migrations auto-apply on merge
and the deploys trigger on the same merge, a single merge to `main` lands all three;
do not deploy pieces out of band. The 2026-08-06 hardening migrations 012 to 017 are
coupled the same way: 024 (private realtime) must land with the frontend `private: true`
flag and needs a live two-client check first, and 016 (client write lockdown) assumes all
writes go through the service-role backend. Review these before merging, as they apply to
production automatically. See [BACKLOG.md](BACKLOG.md) "Needs verification".

Dashboard settings that are NOT in this repo, and that the code assumes:

- Refresh token reuse interval. `supabase/config.toml` sets 30s for local; the hosted
  project needs the same under Auth, Sessions. The default 10s is short enough that an
  installed web app and a browser tab restoring their sessions seconds apart can have the
  second refresh rejected, which signs the player out for real. Inside the interval the
  same token returns a valid session instead. The client also adopts a session another
  context wrote, so this is belt and braces (see DECISIONS).
- Anonymous sign-ins stay OFF in the hosted project. They are on locally, where the dev
  login uses one; the dev button is not rendered outside development.

## CI workflows

All under `.github/workflows/`:

- `test-backend.yml` - `uv run pytest`. Mocked unit and route tests, no database. A
  `backend/tests/conftest.py` provides dummy Supabase settings so the app can be
  imported during collection without a `.env` (CI has none).
- `test-frontend.yml` - `bun run test:run` (Vitest).
- `lint.yml` - ruff (backend) and eslint (frontend).
- `test-migrations.yml` - starts a local Supabase stack and runs `supabase db reset
  --no-seed` to confirm every migration applies to a fresh Postgres, then stops it.
  Triggers on changes under `supabase/`. (Note: its path filter references
  `migrations.yml` while the file is `test-migrations.yml`, so edits to the workflow
  file itself will not re-trigger it; migration changes still do.)
- `deploy-backend.yml` - see above.
- `azure-static-web-apps-*.yml` - see above.

## Environment variables

Backend (`backend/app/core/config.py`, loaded from `.env` locally, required unless
noted):

- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required)
- `SUPABASE_JWT_SECRET` (optional; only for verifying local-dev HS256 tokens)
- `SUPABASE_JWT_ISSUER` (optional, opt-in; do not derive from `SUPABASE_URL`, see
  DECISIONS)
- `ENVIRONMENT` (`development` or `production`, default `development`)
- `CORS_ORIGINS`

Frontend (build-time, `VITE_` prefix): `VITE_ENVIRONMENT`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`.

`.env` is gitignored; `backend/.env.example` holds local-dev defaults.

## AI weights

The backend loads trained weights not committed to git. Storage location (Supabase
Storage or S3) and whether inference is enabled in the deployed container:
`TODO(confirm)`.

## Local development

From the Makefile (run `make help` for the full list):

- `make dev` - start the Supabase stack, then the app containers.
- `make up` / `make down` / `make restart` - app containers (Supabase must be running).
- `make test` - backend and frontend suites.
- `make ci` - tests for both.
- `make db-reset` / `make seed` - local database.
- `make migrate` - push migrations to the hosted project (manual fallback).
- `make docs-check` - regenerate `docs/manifest.json` and flag stale reference docs.
