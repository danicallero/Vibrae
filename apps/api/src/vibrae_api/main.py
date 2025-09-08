from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import logging
import asyncio
import time
import os
from vibrae_core.config import Settings
from vibrae_core.player import Player
from vibrae_core.scheduler import Scheduler
from vibrae_core.db import Base, engine
from vibrae_core.logging_config import configure_logging
from .routes import users, scenes, schedule, logs, control

logger = logging.getLogger("vibrae_api")

configure_logging()
settings = Settings()
player = Player(settings.effective_music_base())
scheduler = Scheduler(player=player)

app = FastAPI(title="Vibrae API", version="0.1.0")

# Core middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Lightweight request log middleware (skips websockets)
@app.middleware("http")
async def request_logger(request, call_next):  # type: ignore
    start = time.time()
    path = request.url.path
    if path.startswith("/health") or path.startswith("/api/health"):
        return await call_next(request)
    response = await call_next(request)
    duration_ms = int((time.time() - start) * 1000)
    logger.info("http %s %s -> %s (%dms)", request.method, path, response.status_code, duration_ms)
    return response

# Group API routes under /api for frontend expectation, while keeping legacy root mounting (for direct calls/scripts).
from fastapi import APIRouter
api_router = APIRouter(prefix="/api")
api_router.include_router(users.router)
api_router.include_router(scenes.router)
api_router.include_router(schedule.router)
api_router.include_router(logs.router)
api_router.include_router(control.router)
app.include_router(api_router)

# Legacy root (non /api) paths still included for backward compatibility
app.include_router(users.router)
app.include_router(scenes.router)
app.include_router(schedule.router)
app.include_router(logs.router)
app.include_router(control.router)

@app.on_event("startup")
async def on_startup():
    Base.metadata.create_all(bind=engine)
    loop = asyncio.get_event_loop()
    from .routes.control import set_main_loop
    set_main_loop(loop)
    scheduler.start_background()
    logger.info("api.start version=%s", app.version)

@app.on_event("shutdown")
async def on_shutdown():
    try:
        scheduler.stop_background()
    except Exception:  # pragma: no cover
        pass
    logger.info("api.stop")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/health")
async def api_health():
    try:
        playing = player.is_playing()
    except Exception:
        playing = False
    return {
        "backend": "ok",
        "player": "running" if playing else "idle",
        "frontend": "unknown",
        "frontend_mode": os.environ.get("FRONTEND_MODE", "auto"),
        "proxy": "nginx" if os.environ.get("NGINX_CONF") else "none",
        "cloudflared": "enabled" if os.environ.get("CLOUDFLARE_TUNNEL_TOKEN") else "disabled",
        "version": app.version,
    }

__all__ = ["app", "player", "scheduler", "settings"]

