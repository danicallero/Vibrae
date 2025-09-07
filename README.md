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
- Encrypted environment files (SOPS + PGP)
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

Scripts (direct):

```bash
scripts/app/run.sh
scripts/app/stop.sh
```

These start backend API, static server (npx serve if export exists), nginx reverse proxy, and optional Cloudflare Tunnel.

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
- **Scripts**: `scripts/app/run.sh` / `scripts/app/stop.sh` (invoked by CLI helpers when available).
- **Frontend**: Expo (web export) served via npx or nginx.
- **Backend**: FastAPI / Uvicorn + SQLite (file DB) using SQLAlchemy.
- **Logging**: Separate `backend.log` and `player.log` via `config/logging.ini` (player & scheduler isolated).

---

## Environment Variables

Layered sources (lowest precedence first):

1. Root `.env` – baseline, non‑secret defaults (shared by scripts & backend).
2. Backend plaintext `config/env/.env.backend` (if present) – working copy of backend secrets (NOT committed).
3. Frontend plaintext `config/env/.env.frontend` (if present) – working copy of build‑time public values (`EXPO_PUBLIC_*`, NOT committed).
4. Encrypted backend `config/env/.env.backend.enc` – committed; decrypts over (2) when changed.
5. Encrypted frontend `config/env/.env.frontend.enc` – committed; decrypts over (3) when changed.
6. Live shell exports – highest precedence for ad‑hoc overrides.

Legacy names (`.env.runtime*`, `.env.frontend.runtime*`) are still READ as a fallback (backend only) with a warning so you can migrate, but new writes/encrypt operations ONLY use `backend` / `frontend` names.

`run.sh` sourcing order now: `.env` → `.env.backend` (or legacy runtime fallback with warning) → `.env.frontend` (no legacy fallback; migrate if still using the old name).

### Root `.env` keys:

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

### Secret Management (SOPS + PGP)

Encryption uses SOPS + PGP key groups (`.sops.yaml`). Policy:

Track only:
- Templates: `config/env/.env.*.example`
- Encrypted secrets: `config/env/.env.*.enc`

Keep (git‑ignored, local only):
- Plaintext working copies: `config/env/.env.backend`, `config/env/.env.frontend`

Commands now RETAIN plaintext after encrypt / edit cycles (no auto shred). This supports iterative local edits without repeated decrypt steps. You must manually ensure you do not commit plaintext files (gitignore already blocks them).

Legacy names still warn: `.env.runtime*`, `.env.frontend.runtime*`.

#### One‑time PGP setup
Import the provided public keys (each machine):
```bash
gpg --import path/to/public_key_1.asc
gpg --import path/to/public_key_2.asc
```
Confirm fingerprints match those in `.sops.yaml`.

#### Migrating old runtime files
If you previously used `*.runtime*` names:
```bash
./vibrae env migrate
```
This renames & re-encrypts to backend/frontend naming (idempotent).

#### Backend secret workflow
```bash
cp config/env/.env.backend.example config/env/.env.backend   # scaffold (or run 'vibrae env sync')
./vibrae env encrypt                                         # produces .env.backend.enc (keeps plaintext)
./vibrae env edit-sec                                        # decrypts (if needed), opens editor, re-encrypts (keeps plaintext)
```
Plaintext retained: use `git add -p` or `git status` to verify it is NOT staged.

#### Frontend secret workflow
```bash
cp config/env/.env.frontend.example config/env/.env.frontend || true
echo "EXPO_PUBLIC_API_URL=https://YOUR_DOMAIN" >> config/env/.env.frontend
./vibrae env f-encrypt          # keeps plaintext
./vibrae env f-edit-sec         # re-encrypt after edit (plaintext kept)
```

#### Decrypt (read‑only to stdout or refresh plaintext)
```bash
./vibrae env decrypt      # backend
./vibrae env f-decrypt    # frontend
```

If plaintext already exists it will just be overwritten with current decrypted content.

#### Safety / CI notes
- Never commit plaintext `config/env/.env.*` files (gitignore blocks them; verify before pushing).
- Commit: `.env.*.example` + `.env.*.enc` only.
- CI/CD: import GPG private key(s), run decrypt to materialize working plaintext before invoking `run.sh` / tests.
- Optional hygiene step (manual): `shred -u config/env/.env.backend config/env/.env.frontend 2>/dev/null || rm -f ...` BEFORE screen sharing or support dumps.

Future enhancement (planned): `vibrae env scrub` to securely remove any plaintext envs prior to publishing artifacts.

#### run.sh sourcing summary
Order: `.env` → `.env.backend` (warn & fallback: `.env.runtime`) → `.env.frontend`.
Frontend legacy name is NOT sourced automatically; migrate if you still rely on it.

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

### Quick Cheat Sheet

| Task | Command |
|------|---------|
| Install deps / venv | `vibrae install` |
| Start / Stop / Restart | `vibrae start` / `vibrae stop` / `vibrae restart` |
| Show status & health | `vibrae status` |
| Tail logs (all / one) | `vibrae logs` / `vibrae logs backend 200` |
| Open web UI | `vibrae open` |
| Print URLs | `vibrae url` |
| Sync missing env keys | `vibrae env sync` |
| Show / edit backend env | `vibrae env show` / `vibrae env edit` |
| Set one key | `vibrae env set KEY=VALUE` |
| Encrypt backend / frontend | `vibrae env encrypt` / `vibrae env f-encrypt` |
| Secure edit backend / frontend | `vibrae env edit-sec` / `vibrae env f-edit-sec` |
| Decrypt (materialize/update) | `vibrae env decrypt` / `vibrae env f-decrypt` |
| Detect music source | `vibrae source detect` |
| Toggle autostart | `vibrae autostart on|off` |
| Initialize database | `vibrae db init` |
| Environment validation | `vibrae check-env` (alias: `ce`) |
| Dependency doctor | `vibrae doctor` (alias: `doc`) |
| Raspberry Pi service logs | `vibrae pi logs` |
| Interactive shell | `vibrae shell` (alias: `sh`) |

Aliases: `ver`→version, `st`→status, `ce`→check-env, `doc`→doctor, `up`→start, `down`→stop, `ls-env`→env show.

### Typical First Run Flow
```bash
vibrae install
vibrae env sync          # ensure recommended keys
vibrae env edit          # set SECRET_KEY, DOMAIN, etc.
vibrae env encrypt       # create .env.backend.enc (plaintext kept)
vibrae db init           # create tables / seed admin
vibrae start             # launch stack
vibrae status            # confirm health
```

### Secure Edit vs Plain Edit
`env edit` edits existing plaintext directly (fails if missing). `env edit-sec` always performs decrypt → edit → re-encrypt, ensuring `.enc` stays current. Both now keep plaintext; use `git status` before committing.

### PGP Key Management (SOPS)
` .sops.yaml` lists recipient fingerprints. To grant a new collaborator access:
1. Add their public key (they send you: `gpg --armor --export <FPR>`).
2. Append their fingerprint under the appropriate SOPS `pgp` recipients in `.sops.yaml`.
3. Re-encrypt each env: `vibrae env encrypt && vibrae env f-encrypt`.
4. Commit updated `.sops.yaml` + `*.enc`.

Rotate / revoke access (lost key or teammate leaves):
1. Remove old fingerprint from `.sops.yaml`.
2. Import replacement/new key(s).
3. Re-encrypt both backend & frontend envs.
4. Commit new encrypted blobs.

List local keys:
```bash
gpg --list-keys
```
Show fingerprints only:
```bash
gpg --list-keys --fingerprint | grep -E '^[ ]+[0-9A-F]{40}$'
```

Test decryption without writing plaintext:
```bash
sops --decrypt config/env/.env.backend.enc >/dev/null
```

### Adding a New Secret
Backend (plaintext present):
```bash
vibrae env set NEW_KEY=value
vibrae env encrypt
```
Frontend:
```bash
echo "EXPO_PUBLIC_FEATURE_FLAG=1" >> config/env/.env.frontend
vibrae env f-encrypt
```

### CI/CD Secrets Flow Example
Pseudo GitHub Actions step (conceptual):
```yaml
- name: Import GPG private key
	run: |
		echo "$GPG_PRIVATE_KEY" | gpg --batch --import
		echo "$GPG_OWNERTRUST" | gpg --batch --import-ownertrust || true
- name: Decrypt env
	run: |
		./vibrae env decrypt
		./vibrae env f-decrypt || true
- name: Start services (test mode)
	run: |
		vibrae db init
		vibrae start
		# run integration tests here
```

If you want to avoid persisting plaintext post‑pipeline, delete them at end:
```bash
rm -f config/env/.env.backend config/env/.env.frontend
```

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

<div align="center">
Made with ❤️, Python, React Native, and Expo by <b>Dani Callero</b>
</div>

---