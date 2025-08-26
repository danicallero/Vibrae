# Vibrae
<p align="center">
  <img src="front/assets/images/logo.png" alt="Vibrae" width="200"/>
</p>
<div align="center">
	<img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="GPLv3 License" />
	<img src="https://img.shields.io/badge/Backend-FastAPI-green" alt="FastAPI" />
	<img src="https://img.shields.io/badge/Frontend-Expo%20React%20Native-blueviolet" alt="Expo React Native" />
	<img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Raspberry%20Pi-lightgrey" alt="Platform" />
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
9. [Screenshots](#screenshots)
10. [License](#license)

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
- Easy deployment with unified scripts
- HTTPS public access via Cloudflare Tunnel
- Customizable playlists, scenes, and schedules
- Control from any device
- Open-source, portable configuration

---

## Folder Structure

```text
garden_music/
├── backend/         # FastAPI backend
│   ├── routes/      # API endpoints
│   ├── models.py    # SQLAlchemy models
│   ├── player.py    # Music player logic
│   ├── scheduler.py # Routine scheduler
│   ├── main.py      # FastAPI app entrypoint
├── front/           # Expo/React Native frontend
│   ├── app/         # SPA routes
│   ├── assets/      # Images, styles, manifest
│   ├── dist/        # Static export for web
├── music/           # Music files (organized by folders/scenes)
├── data/            # SQLite database
├── run.sh           # Unified startup script
├── stop.sh          # Unified shutdown script
├── nginx.conf       # Reverse proxy config
├── .env             # Environment variables
├── .env.example     # Example env file
├── README.md        # This file
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/danicallero/vibrae.git
cd vibrae
```

### 2. Install dependencies

```bash
./setup.sh
```

### 3. Configure environment variables

Copy the example files and edit values as needed:

```bash
cp .env.example .env
cp front/.env.example front/.env
```

See [Environment Variables](#environment-variables) for details and defaults.

### 4. Add your music files

Place music files in the `music/` folder, organized by scene (subfolder).

### 4. Build the web frontend (one-time or after UI changes)

From `front/`, export the static web build so the static server can serve it.

Examples (run in `front/`):

- Expo Dev server (interactive): `npx expo start --web`
- Static export for run.sh: `npx expo export --platform web`

Important: Web export
- The static export may not include all PWA-related tags. After export, manually update `front/dist/index.html` to ensure these are present in `<head>`:
	- `<link rel="manifest" href="/manifest.json">`
	- `<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/icon.png">`
	- Optionally add: `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="theme-color" content="#31DAD5">`
	- The manifest file is at `front/manifest.json`; the icon is at `front/assets/images/icon.png`.

### 5. Start all services

```bash
./run.sh
```

Starts frontend static server, backend API, nginx reverse proxy, and Cloudflare Tunnel.

### 6. Access the app

Visit your public Cloudflare Tunnel URL (e.g. `https://garden.example.com`) from any device.

### 7. Stop all services

```bash
./stop.sh
```

---

## Deployment & Configuration

- **Environment Variables**: All secrets and config are managed via `.env`. See `.env.example` for required variables.
- **nginx**: Reverse proxy for API, WebSocket, and static assets.
- **Cloudflare Tunnel**: HTTPS public access. Requires a valid token in `.env`.
- **Unified Scripts**: `run.sh` and `stop.sh` work on macOS and Linux, auto-detecting OS and starting/stopping all services.
- **Frontend**: Built with Expo, exportable as static SPA or iOS app.
- **Backend**: FastAPI, Uvicorn, SQLite database.

---

## Environment Variables

This project uses two .env files:

1) Root `.env` (consumed by `run.sh`, nginx templating, backend):

- DOMAIN: your public domain (e.g. garden.example.com)
- FRONTEND_PORT: static server port (default: 9081)
- FRONTEND_DIST: path to the exported web build, relative to repo root (default: /front/dist)
- BACKEND_PORT: backend API port (default: 8000)
- BACKEND_MODULE: Uvicorn app module (default: backend.main:app)
- MUSIC_DIR: path relative to repo root for music files (default: music)
- SECRET_KEY: JWT signing secret used by backend auth (required)
- LOG_LEVEL: backend/app log level (default: INFO)
- LOG_KEEP: how many rotated files to keep per log (default: 5)
- LOG_ROTATE_INTERVAL_HOURS: periodic rotation interval (default: 12)
- NGINX_CONF: nginx config file path (default: nginx.conf)
- CLOUDFLARE_TUNNEL_TOKEN: Cloudflare Tunnel token (required)

Notes:
- `run.sh` rotates logs under `logs/` and renders `nginx.conf` with `${DOMAIN}`, `${BACKEND_PORT}`, `${FRONTEND_PORT}`.
- Periodic copy-truncate rotation runs in the background (every LOG_ROTATE_INTERVAL_HOURS) for backend.log, player.log, serve.log, and cloudflared.log.
- `backend/auth.py` reads `SECRET_KEY` from environment; optionally a `backend/.env` can override it.

2) Frontend `front/.env` (consumed at build time by the app):

- API_URL: Base URL for the API. Examples:
	- For production behind nginx: https://YOUR_DOMAIN/api
	- For local with nginx: http://localhost/api
	- For direct dev (bypassing nginx): http://localhost:8000

Tips:
- After changing `front/.env`, rebuild the web app (export) so the static files include the new value.

---

## Logs & Monitoring

- Log files live under `logs/` with rotations stored in `logs/history/`.
	- Current logs: `backend.log`, `player.log`, `serve.log`, `cloudflared.log`.
	- History naming: `<name>-YYYYMMDD-HHMMSS.log`.
- Periodic rotation is enabled (copy-truncate), configurable via `LOG_ROTATE_INTERVAL_HOURS` and `LOG_KEEP`.
- Built-in Logs screen (frontend) lets you:
	- Browse current logs and per-log history.
	- View tail content with adjustable line count.
	- Navigate history (“Latest” + timestamps).


---

## Screenshots



---

## License

This project is licensed under the GNU GPLv3. See `LICENSE` for full terms.

Note: Prior releases may have referenced MIT; as of this change, the codebase is distributed under GPLv3 going forward.

<div align="center">
Made with ❤️, Python, React Native, and Expo by <b>Dani Callero</b>
</div>
