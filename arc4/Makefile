# CRM de Cobrança ARC4 — comandos do dia a dia. Rode a partir de arc4/.
DATABASE_URL ?= postgresql://arc4:arc4@localhost:5432/arc4
TEST_DATABASE_URL ?= $(DATABASE_URL)
FIXTURES ?= importador/tests/.fixtures/20261119
export DATABASE_URL

.PHONY: help setup up down db migrate migrate-docker fixtures test test-py test-web lint fmt dev import

help: ## Lista os comandos
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

setup: ## Instala dependências (uv + npm)
	uv sync
	cd web && npm ci

up: ## Sobe postgres + api + web (docker compose)
	docker compose up -d --build

down: ## Derruba os serviços (mantém o volume do banco)
	docker compose down

db: ## Sobe só o banco
	docker compose up -d db

migrate: ## Aplica as migrations (reaplicável)
	uv run alembic -c db/alembic.ini upgrade head

migrate-docker: ## Aplica as migrations de dentro do container da API
	docker compose run --rm api alembic -c db/alembic.ini upgrade head

fixtures: ## Gera os 27 ZIPs sintéticos em $(FIXTURES)
	uv run python -m arc4_importador.fixtures --destino $(FIXTURES)

test: test-py test-web ## Todos os testes

test-py: ## Testes Python (banco em TEST_DATABASE_URL; sem ele, os testes de banco são pulados)
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) uv run pytest

test-web: ## Testes do frontend
	cd web && npm test

lint: ## Lint Python e frontend
	uv run ruff check .
	uv run ruff format --check .
	cd web && npm run lint

fmt: ## Formata o código Python
	uv run ruff check --fix .
	uv run ruff format .

dev: ## API (:8000, reload) + web (:5173) em modo desenvolvimento; banco via `make db`
	@trap 'kill 0' INT TERM; \
	uv run uvicorn arc4_api.main:app --reload --port 8000 & \
	(cd web && npm run dev) & \
	wait

import: ## Importa uma carga local (Fase 2 — ainda não implementado)
	@echo "Importador ainda não implementado (backlog F2.1–F2.8). DATA=$(DATA)" >&2; exit 2
