# Vibrae
<p align="center">
	<img src="apps/web/assets/images/logo.png" alt="Vibrae" width="200"/>
</p>
<div align="center">
	<img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="GPLv3 License" />
	<img src="https://img.shields.io/badge/Backend-FastAPI-green" alt="FastAPI" />
	<img src="https://img.shields.io/badge/Frontend-Expo%20React%20Native-blueviolet" alt="Expo React Native" />
	<img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Raspberry%20Pi-lightgrey" alt="Platform" />
	<a href="https://github.com/danicallero/vibrae/actions/workflows/ci.yml"><img src="https://github.com/danicallero/vibrae/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
	<a href="https://github.com/danicallero/vibrae/actions/workflows/codeql.yml"><img src="https://github.com/danicallero/vibrae/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
	<a href="https://github.com/danicallero/vibrae/actions/workflows/sbom.yml"><img src="https://github.com/danicallero/vibrae/actions/workflows/sbom.yml/badge.svg" alt="SBOM" /></a>
</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Folder Structure](#folder-structure)
4. [Quick Start](#quick-start)
5. [Deployment & Configuration](#deployment--configuration)
6. [Environment Variables](#environment-variables)
7. [Logs & Monitoring](#logs--monitoring)
8. [CLI Usage](#cli-usage)
9. [Screenshots](#screenshots)
10. [Testing](#testing)
11. [License](#license)

---

## Overview

**Vibrae** is a full-stack, open-source music automation system for gardens, patios, or any space where ambient music can enhance the experience. Designed for flexibility, customization, and ease of use, Vibrae enables fully self-hosted control—no external services or proprietary hardware required.

> **Why Vibrae?**
> Most music scheduling systems are basic, cloud-dependent, or tied to proprietary hardware. Vibrae is self-hosted, flexible, and fully controllable, running on Raspberry Pi, Mac, or Linux. Enjoy scheduled playlists, scenes, routines, volume control, and real-time updates from any device.

---

## Features

- Real-time music scheduling & playback
- Scene and routine management
- Mobile/PWA frontend (Expo, React Native)
- Easy deployment with unified scripts or Docker Compose
- Optional secure access via Tailscale VPN
- Reverse proxy via nginx (Cloudflare Tunnel or VPN handles HTTPS)
- Encrypted environment files (SOPS + Age)
- Customizable playlists, scenes, schedules
- Control from any device
- Open-source, portable configuration

---

## Folder Structure

```text
apps/
	api/                      # FastAPI application (vibrae_api)
	web/                      # Expo / React Native web export & source
packages/
	core/                     # vibrae_core domain package (config, db, auth, player, scheduler)
config/
	env/                      # Encrypted runtime env + Age keys
	logging.ini               # Logging template (PLACEHOLDER replaced)
scripts/
	app/                      # Lifecycle scripts (run, stop, setup)
	pi/                       # Raspberry Pi deployment helpers (systemd units)
	ops/                      # Future operational helpers
music/                      # Media library (folder-per-scene)
tests/                      # Pytest suite (player focus; extend as needed)
vibrae                      # CLI entrypoint & interactive shell
pyproject.toml              # Project / dev dependencies (preferred)
requirements.txt            # Thin compatibility list (will shrink/vanish)
run.sh / stop.sh / setup.sh # Top-level wrappers (delegate to scripts/app/)
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/danicallero/vibrae.git
cd vibrae
```

### 2. Install dependencies

One-shot (recommended):

```bash
./setup.sh           # creates venv, installs deps (pyproject), builds web if needed
```

Manual (fine-grained):

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .[dev]          # project + dev extras (ruff, pytest, etc.)
pip install -e packages/core/src  # if you want isolated editable core
```

### 3. Configure environment variables

Copy the example files and edit values as needed:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
```

See [Environment Variables](#environment-variables) for details and defaults.

### 4. Add your music files

Place music files in the `music/` folder, organized by scene (subfolder).

### 4. Build the web frontend (one-time or after UI changes)

From `apps/web/`, export the static web build so the static server can serve it.

Examples (run in `apps/web/`):

- Expo Dev server (interactive): `npx expo start --web`
- Static export for run.sh: `npx expo export --platform web`

Important: Web export
- The static export may not include all PWA-related tags. After export, manually update `apps/web/dist/index.html` to ensure these are present in `<head>`:
	- `<link rel="manifest" href="/manifest.json">`
	- `<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/icon.png">`
	- Optionally add: `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="theme-color" content="#31DAD5">`
	- The manifest file is at `apps/web/manifest.json`; the icon is at `apps/web/assets/images/icon.png`.

### 5. Start all services

You can use either the CLI or the scripts directly.

CLI:

```bash
vibrae start   # start stack (prints license notice)
vibrae status  # show running services
vibrae stop    # stop stack (prints license notice)
vibrae restart # stop + start
```

Scripts:

```bash
./run.sh
./stop.sh
```

Both start backend API, static server (npx serve if export exists), nginx reverse proxy, and optional Cloudflare Tunnel.

### 6. Access the app

Visit your public Cloudflare Tunnel URL (e.g. `https://garden.example.com`) from any device.

### 7. Stop all services

```bash
vibrae stop
```

Alternatively, you can run `./stop.sh`.

---

## Deployment & Configuration

- **Environment Variables**: Managed via root `.env` (plus optional encrypted runtime file). See `.env.example`.
- **nginx**: Reverse proxy for API, WebSocket, static assets.
- **Cloudflare Tunnel**: HTTPS public access; token required when enabled.
- **Scripts**: `run.sh` / `stop.sh` wrapper over `scripts/app/*.sh` for portability.
- **Frontend**: Expo (web export) served via npx or nginx.
- **Backend**: FastAPI / Uvicorn + SQLite (file DB) using SQLAlchemy.
- **Logging**: Separate `backend.log` and `player.log` via `config/logging.ini` (player & scheduler isolated).

---

## Environment Variables

This project uses two .env files:

1) Root `.env` (consumed by scripts + backend):

- DOMAIN: your public domain (e.g. garden.example.com)
- FRONTEND_PORT: static server port (default: 9081)
- FRONTEND_DIST: path to the exported web build, relative to repo root (default: /apps/web/dist)
- BACKEND_PORT: backend API port (default: 8000)
- BACKEND_MODULE: Uvicorn app module (default: apps.api.src.vibrae_api.main:app)
- MUSIC_DIR: path relative to repo root for music files (default: music)
- SECRET_KEY: JWT signing secret used by backend auth (required)
- LOG_LEVEL: backend/app log level (default: INFO)
- LOG_KEEP: how many rotated files to keep per log (default: 5)
- LOG_ROTATE_INTERVAL_HOURS: periodic rotation interval (default: 12)
- NGINX_CONF: nginx config file path (default: nginx.conf)
- CLOUDFLARE_TUNNEL_TOKEN: Cloudflare Tunnel token (required when TUNNEL=cloudflared)

Notes:
- `run.sh` rotates logs and renders `nginx.conf` with `${DOMAIN}`, `${BACKEND_PORT}`, `${FRONTEND_PORT}`.
- Periodic rotation loop handles: backend.log, player.log, serve.log, cloudflared.log.
- Separate log handlers ensure player/scheduler noise doesn't flood API logs.

### Encrypted Runtime Env (SOPS + Age)

Instead of committing a plain `.env.runtime`, the repository stores `.env.runtime.enc` encrypted under `config/env/`.

CLI helpers (see also `vibrae help`):

```bash
./vibrae env encrypt     # encrypt .env.runtime -> .env.runtime.enc
./vibrae env decrypt     # decrypt to stdout (never writes plaintext by default)
./vibrae env edit-sec    # open secure editor; auto re-encrypt when you exit
```

Key material lives under `config/env/keys`. Age recipients are defined in `.sops.yaml`.

Typical workflow:
1. Copy `.env.example` to `.env.runtime` and edit values.
2. `./vibrae env encrypt` (produces `.env.runtime.enc` committed to git).
3. Delete or ignore the plaintext file locally if desired.
4. On another machine: `./vibrae env decrypt > .env.runtime` then `./run.sh`.

Quick commands:
```bash
make secrets-decrypt        # decrypt to .env.runtime
./vibrae env edit-sec       # safe edit (decrypt -> edit -> re-encrypt)
./vibrae env encrypt        # encrypt & remove plaintext
```

Optional: enable protective pre-commit hook (blocks committing plaintext secrets):
```bash
git config core.hooksPath .githooks
```

2) Frontend `apps/web/.env` (build-time):

- API_URL: Base URL for the API. Examples:
	- For production behind nginx: https://YOUR_DOMAIN/api
	- For local with nginx: http://localhost/api
	- For direct dev (bypassing nginx): http://localhost:8000

Tips:
- After changing `apps/web/.env`, rebuild the web app (export) so the static files include the new value.

---

## Health Checks

Check service health at:

```
GET /health
```

Returns JSON:

```
{
	"backend": "ok",
	"frontend": "ok" | "missing",
	"player": "ok" | "idle"
}
```

## Logs & Monitoring

Logs under `logs/` with history in `logs/history/`:

| File | Purpose |
|------|---------|
| backend.log | API + uvicorn + general app messages |
| player.log  | Player & scheduler events (separate handler) |
| serve.log   | Static server (npx serve) output |
| cloudflared.log | Tunnel connection logs |

Rotation:
- Copy-truncate; configurable via `LOG_KEEP` & `LOG_ROTATE_INTERVAL_HOURS`.
- History naming: `<name>-YYYYMMDD-HHMMSS.log`.

Frontend Logs UI:
- Browse latest and historical files.
- Tail with adjustable line count.
- Jump between history snapshots quickly.



## CLI Usage

Grouped summary (see `vibrae help` for full list):

Core: `start`, `stop`, `restart`, `status`, `logs`, `open`, `url`
Environment: `env show|edit|set|sync|encrypt|decrypt|edit-sec`
Database: `db init`
Music Source: `source detect`, `autostart on|off`
Diagnostics: `check-env`, `doctor`
Raspberry Pi: `pi install|start|stop|status|logs`
Misc: `shell`, `clear`, `version`, `help`

Inside interactive shell: `help`, `status`, `logs`, etc. AUTOSTART (if true) triggers service start upon entering shell.

## Screenshots




## Testing

### Overview
Automated tests cover the refactored playback engine (crossfade, guard window, shutdown) using a lightweight mock of `python-vlc`. This allows fast, deterministic runs with no audio output.

### Run Tests
From the project root:

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

### VLC Mock Design
- Defined in `tests/conftest.py` as an autouse fixture `mock_vlc`.
- Replaces the real `vlc` module before `vibrae_core.player` is imported.
- Media duration is short (a few seconds) so crossfades complete quickly.
- Player state is exercised via the real playback thread; only the media/volume/time functions are simulated.

### Adding More Tests
- Use the provided `player_module` fixture to access a freshly reloaded `vibrae_core.player` module that already sees the mock.
- Instantiate `Player` normally; inject a `notify_cb` to capture events (see `tests/test_player_crossfade.py`).
- For timing assertions prefer the helper `wait_until(predicate, timeout, poll_interval)` instead of ad‑hoc sleeps.

### Customizing Mock Behavior
Adjust or extend the mock in `tests/conftest.py`:
- Change track duration returned by `MockMedia.get_duration()` to lengthen or shorten crossfade windows.
- Add extra state fields if you need to assert intermediate phases.

### Using Real VLC (Optional)
If you want an integration run with real audio:
1. Temporarily comment out or rename the `mock_vlc` autouse fixture in `tests/conftest.py`.
2. Ensure local VLC runtime / `python-vlc` is installed.
3. Provide actual media files under `music/`.

Keep such runs separate; unit tests should remain fast and silent by default.

---

## License

This project is licensed under the GNU GPLv3. See `LICENSE` for full terms.

Note: Prior releases may have referenced MIT; as of this change, the codebase is distributed under GPLv3 going forward.

<div align="center">
Made with ❤️, Python, React Native, and Expo by <b>Dani Callero</b>
</div>

---

### Imports
Primary application entrypoint:

```
apps.api.src.vibrae_api.main:app
```

Player usage:

```python
from vibrae_core.player import Player
```

### Editor import warnings (vibrae_core)
If your editor shows `Import "vibrae_core.*" could not be resolved`, add `packages/core/src` (and `apps/api/src`) to the Python path.

VS Code `.vscode/settings.json` example:
```json
{
	"python.analysis.extraPaths": [
		"packages/core/src",
		"apps/api/src"
	]
}
```

Temporary shell session:
```bash
export PYTHONPATH=packages/core/src:apps/api/src:$PYTHONPATH
```

Editable install (recommended for contributors):
```bash
pip install -e .[dev]
```
