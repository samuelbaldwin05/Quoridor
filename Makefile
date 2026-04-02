.PHONY: help dev build up down logs reset \
        backend-shell frontend-shell db-shell \
        lint-backend format-backend test-backend \
        lint-frontend migrate seed

# ── Help ────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Quoridor — development commands"
	@echo ""
	@echo "  Docker (all services)"
	@echo "    make dev           Build images + start with logs (foreground)"
	@echo "    make build         Rebuild images without starting"
	@echo "    make up            Start in background (no rebuild)"
	@echo "    make down          Stop all services"
	@echo "    make reset         Stop + wipe database volume (fresh start)"
	@echo "    make logs          Tail all logs"
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
	@echo "    make lint-frontend  ESLint + tsc check"
	@echo ""
	@echo "  Database"
	@echo "    make migrate        Push Supabase migrations (hosted project)"
	@echo "    make seed           Load seed data into running local DB"
	@echo ""

# ── Docker ───────────────────────────────────────────────────────────────────
dev:
	docker compose up --build

up:
	docker compose up -d

build:
	docker compose build

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f

# ── Shells ────────────────────────────────────────────────────────────────────
backend-shell:
	docker compose exec backend bash

frontend-shell:
	docker compose exec frontend sh

db-shell:
	docker compose exec db psql -U postgres

# ── Backend ──────────────────────────────────────────────────────────────────
lint-backend:
	cd backend && uv run ruff check . && uv run ruff format --check .

format-backend:
	cd backend && uv run ruff check --fix . && uv run ruff format .

test-backend:
	cd backend && uv run pytest

# ── Frontend ─────────────────────────────────────────────────────────────────
lint-frontend:
	cd frontend && bun run tsc --noEmit && bun run lint

# ── Database ─────────────────────────────────────────────────────────────────
migrate:
	supabase db push

seed:
	docker compose exec db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/seed.sql
