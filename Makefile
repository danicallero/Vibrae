PROJECT?=vibrae
PYTHON?=python3
VENV?=.venv
export PYTHONPATH:=$(PWD):$(PWD)/apps/api/src:$(PWD)/packages/core/src

.PHONY: help install venv lint test run docker-build docker-up docker-down clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?##' Makefile | awk -F':|##' '{printf "\033[36m%-18s\033[0m %s\n", $$1, $$3}' | sort

venv: ## Create virtualenv
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip

install: venv ## Install all dependencies from pyproject.toml
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e .[dev]

lint: ## Run Ruff lint
	@which ruff >/dev/null 2>&1 && ruff check packages/core/src apps/api/src || echo "Ruff not installed, run: pip install ruff"

test: install ## Run test suite
	$(VENV)/bin/pytest -q

run: install ## Run API locally (dev mode)
	$(VENV)/bin/uvicorn apps.api.src.vibrae_api.main:app --reload --port 8000

clean: ## Remove build artifacts and caches
	rm -rf $(VENV) .pytest_cache .ruff_cache .mypy_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

docker-build: ## Build API image
	docker build -f Dockerfile.api -t $(PROJECT)/api:dev .

docker-up: ## Start compose stack
	docker compose up -d

docker-down: ## Stop compose stack
	docker compose down
