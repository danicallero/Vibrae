# Vibrae

<div align="center">
	<img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" />
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
6. [Screenshots](#screenshots)
7. [License](#license)

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

Copy `.env.example` to `.env` and fill in your secrets:

- `CLOUDFLARE_TUNNEL_TOKEN` (from Cloudflare)
- Backend: `SECRET_KEY`, `ADMIN_TOKEN`, `MUSIC_DIR`
- Frontend: `API_URL`, `EXPO_PUBLIC_API_URL`

### 4. Add your music files

Place music files in the `music/` folder, organized by scene (subfolder).

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

## Screenshots



---

## License

This project is licensed under the MIT License.

<div align="center">
Made with ❤️, Python, React Native, and Expo by <b>Dani Callero</b>
</div>
