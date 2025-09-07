from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncio
from vibrae_core.config import Settings
from vibrae_core.player import Player
from vibrae_core.scheduler import Scheduler
from vibrae_core.db import Base, engine
from vibrae_core.logging_config import configure_logging
from .routes import users, scenes, schedule, logs, control

logger = logging.getLogger(__name__)

configure_logging()
settings = Settings()
player = Player(media_root=settings.media_root)
scheduler = Scheduler(player=player)

app = FastAPI(title="Vibrae API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    logger.info("Vibrae API started")

@app.on_event("shutdown")
async def on_shutdown():
    try:
        scheduler.stop_background()
    except Exception:  # pragma: no cover
        pass
    logger.info("Vibrae API stopped")

@app.get("/health")
async def health():
    return {"status": "ok"}

__all__ = ["app", "player", "scheduler", "settings"]

