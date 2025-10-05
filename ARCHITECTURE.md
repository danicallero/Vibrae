# Vibrae Architecture

This document describes the simplified architecture of Vibrae after the 2025 cleanup.

## Overview

Vibrae is a monorepo containing:
- **Backend**: FastAPI service (`apps/api/`)
- **Frontend**: Expo React Native web app (`apps/web/`)
- **Core**: Shared domain logic (`packages/core/`)

## Project Structure

```
vibrae/
├── apps/
│   ├── api/src/vibrae_api/       # FastAPI application
│   └── web/                       # Expo React Native (web export)
├── packages/
│   └── core/src/vibrae_core/     # Core domain logic
├── config/
│   ├── env/.env.example          # Configuration template
│   └── logging.ini               # Logging configuration
├── scripts/
│   ├── app/                      # Generic deployment scripts
│   └── pi/                       # Raspberry Pi systemd scripts
├── lib/
│   └── vibrae_helpers.sh         # Shell utilities
├── music/                        # Media files (gitignored)
├── data/                         # SQLite database (gitignored)
├── logs/                         # Runtime logs (gitignored)
├── tests/                        # Pytest test suite
├── vibrae                        # CLI entrypoint
├── pyproject.toml                # Single source of truth for deps
└── Makefile                      # Development shortcuts
```

## Simplified Design Principles

### 1. Single Dependency Source
- **Before**: Multiple `pyproject.toml` files + `requirements.txt`
- **After**: Single root `pyproject.toml` with all dependencies
- **Why**: Eliminates version conflicts and duplicate maintenance

### 2. Unified Configuration
- **Before**: Complex layering (backend/frontend/runtime/encrypted variants)
- **After**: Single `config/env/.env.backend` file
- **Why**: Easier to understand and maintain

### 3. Clear Package Structure
- **Before**: Multiple packages with redundant configs
- **After**: Two focused packages (api, core)
- **Why**: Removed unused `packages/shared`, consolidated configs

### 4. Documentation Over Commits
- **Before**: 40+ old log files committed to git
- **After**: Logs gitignored, documented rotation policy
- **Why**: Smaller repo, clearer history

## Component Architecture

### Backend (FastAPI)
- **Location**: `apps/api/src/vibrae_api/`
- **Entry**: `main.py:app`
- **Port**: 8000 (configurable)
- **Features**:
  - RESTful API for music control
  - WebSocket for real-time updates
  - JWT authentication
  - SQLite database

### Frontend (Expo)
- **Location**: `apps/web/`
- **Build**: Static export to `apps/web/dist/`
- **Port**: 9081 (static server)
- **Features**:
  - PWA-capable web app
  - Scene management UI
  - Routine scheduling
  - Real-time playback status

### Core Domain
- **Location**: `packages/core/src/vibrae_core/`
- **Modules**:
  - `auth.py` - Authentication & authorization
  - `db.py` - Database setup
  - `models.py` - SQLAlchemy models
  - `player.py` - Music player with crossfade
  - `scheduler.py` - Time-based routine execution
  - `config.py` - Configuration management
  - `logging_config.py` - Logging setup

## Deployment Models

### Development (macOS/Linux)
```
scripts/app/run.sh
├── Backend (uvicorn)
├── Frontend (npx serve)
├── Nginx (reverse proxy)
└── Cloudflared (optional tunnel)
```

### Production (Raspberry Pi)
```
systemd units
├── vibrae-backend.service
├── vibrae-frontend.service
└── vibrae-cloudflared.service
```

## Configuration Flow

```
config/env/.env.example
    ↓ (copy & edit)
config/env/.env.backend
    ↓ (loaded by scripts)
Environment Variables
    ↓ (used by)
Backend + Frontend
```

Optional encryption path:
```
config/env/.env.backend
    ↓ (vibrae env encrypt)
config/env/.env.backend.enc  (committed to git)
```

## Data Flow

```
Music Files (music/*)
    ↓
Player (vibrae_core.player)
    ↓
Scheduler (vibrae_core.scheduler)
    ↓
API (FastAPI endpoints)
    ↓
WebSocket / REST
    ↓
Frontend (React Native Web)
```

## Build & Run

### Local Development
```bash
make install    # Install dependencies
make test       # Run tests
make run        # Start backend (dev mode)
vibrae start    # Start full stack
```

### Production
```bash
# One-time setup
sudo ./scripts/pi/setup.sh

# Start/stop
sudo systemctl start vibrae-backend
sudo systemctl stop vibrae-backend
```

## Testing Strategy

Tests are in `tests/` and use pytest:
- Unit tests for core logic (player, scheduler, auth)
- Integration tests for API endpoints
- Configuration tests
- Database tests

Run with: `make test` or `pytest -q`

## Logging

All logs go to `logs/` directory:
- `backend.log` - API and main service
- `player.log` - Music player events
- `auth.log` - Authentication events
- `websocket.log` - WebSocket connections

Rotation: Automatic based on `LOG_ROTATE_INTERVAL_HOURS` (default: 12h)
Retention: Keep last `LOG_KEEP` files (default: 5)

## Network Architecture

```
Internet
    ↓
Cloudflare Tunnel (optional)
    ↓
Nginx (reverse proxy) :80/:443
    ├── /api/* → Backend :8000
    ├── /ws/* → WebSocket :8000
    └── /* → Frontend :9081
```

## Security

- JWT tokens for API authentication
- Bcrypt for password hashing
- HTTPS via Cloudflare Tunnel
- Environment-based secrets (not committed)
- Optional SOPS encryption for sensitive config

## Future Improvements

This simplified architecture enables:
1. Easier onboarding for new contributors
2. Faster CI/CD builds (fewer dependencies)
3. Clearer upgrade paths
4. Better testability
5. Simpler deployment scenarios
