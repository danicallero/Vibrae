# main.py
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from backend.routes import users, scenes, schedule, control, logs
from fastapi.middleware.cors import CORSMiddleware
from backend.player import Player
from backend.scheduler import Scheduler
import os
import asyncio
from dotenv import load_dotenv
from backend.config import Settings

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
settings = Settings()
MUSIC_DIR = settings.effective_music_base()
player = Player(MUSIC_DIR)
scheduler = Scheduler(player)

web_dist = settings.effective_web_dist()

@app.on_event("startup")
async def startup_event():
    # Store main loop so control.notify_ws_clients_threadsafe works from threads
    control.set_main_loop(asyncio.get_running_loop())
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.stop()
    player.stop()

# Expose API under both root (/) and /api prefix so it works with or without a reverse proxy rewriting
app.include_router(users.router)
app.include_router(scenes.router)
app.include_router(schedule.router)
app.include_router(control.router)
app.include_router(logs.router)

app.include_router(users.router, prefix="/api")
app.include_router(scenes.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(control.router, prefix="/api")
app.include_router(logs.router, prefix="/api")

# Health check endpoint
@app.get("/health")
def health():
    import os
    web_dist = settings.effective_web_dist()
    frontend_ok = bool(web_dist and os.path.isdir(web_dist))
    return {
        "backend": "ok",
        "frontend": "ok" if frontend_ok else "missing",
        "frontend_mode": os.getenv("FRONTEND_MODE", "auto"),
        "player": "ok" if player.is_playing() else "idle"
    }

# Tolerate /api/* reaching backend directly by redirecting to the same path without the /api prefix.
# This is a safety net in case the reverse proxy isn't stripping the prefix yet.
@app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def strip_api_prefix(full_path: str):
    # 307 preserves the method and body for POST/PUT/PATCH
    return RedirectResponse(url=f"/{full_path}", status_code=307)

# Mount static frontend last so API routes take precedence
if web_dist:
    app.mount("/", StaticFiles(directory=web_dist, html=True), name="frontend")
