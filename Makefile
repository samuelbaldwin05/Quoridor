# Shell configuration for Git Bash compatibility on Windows
ifeq ($(OS),Windows_NT)
	SHELL := C:/Program Files/Git/bin/bash.exe
	ifeq ($(wildcard $(SHELL)),)
		SHELL := C:/Program Files/Git/usr/bin/bash.exe
	endif
	export PATH := C:/Program Files/Git/usr/bin:$(PATH)
else
	SHELL := /bin/bash
endif
.SHELLFLAGS := -euo pipefail -c

.PHONY: help init dev up down restart rebuild logs clean \
        backend-shell frontend-shell db-shell db-reset \
        lint-backend format-backend test-backend \
        lint-frontend format-frontend test-frontend \
        test ci migrate seed docs-check

# ── Help ─────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@echo ""
	@echo "  Quoridor — development commands"
	@echo ""
	@echo "  Setup"
	@echo "    make init           Copy .env.example -> .env for each service (skips existing)"
	@echo ""
	@echo "  Dev"
	@echo "    make dev            Start Supabase + build and start app containers"
	@echo "    make up             Start app containers only (Supabase already running)"
	@echo "    make down           Stop app containers + Supabase"
	@echo "    make restart        Restart app containers only (Supabase keeps running)"
	@echo "    make rebuild        Rebuild app images --no-cache and restart"
	@echo "    make logs           Tail app container logs"
	@echo "    make clean          Stop everything + wipe all volumes"
	@echo ""
	@echo "  Shells"
	@echo "    make backend-shell  Open shell in backend container"
	@echo "    make frontend-shell Open shell in frontend container"
	@echo "    make db-shell       psql into Postgres"
	@echo ""
	@echo "  Backend"
	@echo "    make lint-backend   Lint + format check (ruff)"
	@echo "    make format-backend Auto-fix lint + format (ruff)"
	@echo "    make test-backend   Run pytest"
	@echo ""
	@echo "  Frontend"
	@echo "    make lint-frontend  tsc + ESLint + Prettier check"
	@echo "    make format-frontend Auto-format (Prettier)"
	@echo "    make test-frontend  Run Vitest"
	@echo ""
	@echo "  CI"
	@echo "    make test           Run all tests (frontend + backend), no linting"
	@echo "    make ci             Run linting and testing for frontend and backend"
	@echo ""
	@echo "  Database"
	@echo "    make db-reset       Wipe DB, rerun migrations + seed (supabase db reset)"
	@echo "    make seed           Load seed data without wiping"
	@echo "    make migrate        Push migrations to hosted Supabase project"
	@echo ""
	@echo "  Docs"
	@echo "    make docs-check     Regenerate docs/manifest.json + flag stale reference docs"
	@echo ""

# ── Init ─────────────────────────────────────────────────────────────────────
init: ## Copy .env.example files
	@for f in frontend backend supabase; do \
		if [ ! -f $$f/.env ] && [ -f $$f/.env.example ]; then \
			cp $$f/.env.example $$f/.env; \
			echo "created $$f/.env"; \
		else \
			echo "skipped $$f/.env (already exists)"; \
		fi \
	done

# ── Dev ───────────────────────────────────────────────────────────────────────
dev: ## Start Supabase then app containers
	bun x supabase start || { echo ">> supabase start failed (often a flaky realtime healthcheck on cold start) — retrying once..."; bun x supabase start; }
	docker compose up --build -d

up: ## Start app containers only
	@docker network inspect supabase_network_QuoridorEngine >/dev/null 2>&1 || { echo ">> Supabase network not found — Supabase isn't running. Run 'make dev' first."; exit 1; }
	docker compose up -d

down: ## Stop app containers + Supabase
	docker compose down
	bun x supabase stop

restart: ## Restart app containers only (Supabase keeps running)
	docker compose down
	@docker network inspect supabase_network_QuoridorEngine >/dev/null 2>&1 || { echo ">> Supabase network not found — Supabase isn't running. Run 'make dev' first."; exit 1; }
	docker compose up -d

rebuild: ## Rebuild app images from scratch and restart
	docker compose down
	docker compose build --no-cache
	docker compose up -d

nuke: ## Stop everything, wipe all volumes, rebuild from scratch
	docker compose down -v
	bun x supabase stop --no-backup
	docker compose build --no-cache
	bun x supabase start
	docker compose up -d

logs: ## Tail app container logs
	docker compose logs -f

clean: ## Stop everything and wipe all volumes
	docker compose down -v
	bun x supabase stop --no-backup

# ── Shells ────────────────────────────────────────────────────────────────────
backend-shell: ## Open shell in backend container
	docker compose exec backend bash

frontend-shell: ## Open shell in frontend container
	docker compose exec frontend sh

db-shell: ## psql into Postgres
	docker exec -it supabase_db_QuoridorEngine psql -U postgres

# ── Backend ──────────────────────────────────────────────────────────────────
lint-backend: ## Lint + format check
	cd backend && uv run ruff check . && uv run ruff format --check .

format-backend: ## Auto-fix lint + format
	cd backend && uv run ruff check --fix . && uv run ruff format .

test-backend: ## Run pytest
	cd backend && uv run pytest

# ── Frontend ─────────────────────────────────────────────────────────────────
lint-frontend: ## tsc + ESLint + Prettier check
	cd frontend && bun run tsc -b --noEmit && bun run lint && bun run format:check

format-frontend: ## Auto-format with Prettier
	cd frontend && bun run format

test-frontend: ## Run Vitest
	cd frontend && bun run test:run

# ── CI ───────────────────────────────────────────────────────────────────────
test: ## Run all tests (frontend + backend), no linting
	@$(MAKE) test-backend
	@$(MAKE) test-frontend

ci: ## Run linting and testing checks
	@$(MAKE) lint-backend
	@$(MAKE) lint-frontend
	@$(MAKE) test-backend
	@$(MAKE) test-frontend

# ── Database ─────────────────────────────────────────────────────────────────
db-reset: ## Wipe DB and rerun all migrations + seed.sql
	bun x supabase db reset

seed: ## Load seed data without wiping
	docker exec -i supabase_db_QuoridorEngine psql -U postgres -d postgres < supabase/seed.sql

migrate: ## Push migrations to hosted Supabase project
	bun x supabase db push

# ── Docs ─────────────────────────────────────────────────────────────────────
docs-check: ## Regenerate docs/manifest.json and flag stale reference docs
	python scripts/docs_manifest.py
