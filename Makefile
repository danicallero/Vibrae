PROJECT?=vibrae
PYTHON?=python3
VENV?=.venv
export PYTHONPATH:=$(PWD):$(PWD)/apps/api/src:$(PWD)/packages/core/src

.PHONY: help install venv lint test run docker-build docker-up docker-down secrets-decrypt secrets-edit sbom

help:
	@grep -E '^[a-zA-Z_-]+:.*?##' Makefile | awk -F':|##' '{printf "\033[36m%-18s\033[0m %s\n", $$1, $$3}' | sort

venv: ## Create virtualenv
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip

install: venv ## Install dependencies (editable core + API extras)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e packages/core/src -r requirements.txt || true
	# Prefer pyproject if present
	[ -f pyproject.toml ] && $(VENV)/bin/pip install -e .[dev] || true

lint: ## Run Ruff lint (if installed)
	@which ruff >/dev/null 2>&1 && ruff check packages/core/src apps/api/src || echo "Ruff not installed"

test: install ## Run test suite
	$(VENV)/bin/pytest -q

run: install ## Run API locally
	$(VENV)/bin/uvicorn apps.api.src.vibrae_api.main:app --reload --port 8000

docker-build: ## Build API image
	docker build -f Dockerfile.api -t $(PROJECT)/api:dev .

docker-up: ## Start compose stack
	docker compose up -d

docker-down: ## Stop compose stack
	docker compose down

secrets-decrypt: ## Decrypt runtime env to .env.runtime (requires sops)
	sops --decrypt config/env/.env.runtime.enc > .env.runtime

secrets-edit: ## Securely edit runtime env (decrypt -> edit -> re-encrypt; requires sops)
	./vibrae env edit-sec

frontend-secrets-decrypt: ## Decrypt frontend runtime env to .env.frontend.runtime (requires sops)
	sops --decrypt config/env/.env.frontend.runtime.enc > .env.frontend.runtime

frontend-secrets-edit: ## Securely edit frontend runtime env (decrypt -> edit -> re-encrypt; requires sops)
	./vibrae env f-edit-sec

sbom: ## Generate SBOM via syft
	which syft >/dev/null 2>&1 || (echo "Install syft first" && exit 1)
	syft dir:. -o cyclonedx-json > sbom-repo.cdx.json
