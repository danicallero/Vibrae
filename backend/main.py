# main.py
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import FastAPI
from backend.routes import users, scenes, schedule, control, logs
from fastapi.middleware.cors import CORSMiddleware
from backend.player import Player
from backend.scheduler import Scheduler
import os
import asyncio
from dotenv import load_dotenv

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
MUSIC_DIR_ENV = os.getenv("MUSIC_DIR")
MUSIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", MUSIC_DIR_ENV))
player = Player(MUSIC_DIR)
scheduler = Scheduler(player)

@app.on_event("startup")
async def startup_event():
    # Store main loop so control.notify_ws_clients_threadsafe works from threads
    control.set_main_loop(asyncio.get_running_loop())
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.stop()
    player.stop()

app.include_router(users.router)
app.include_router(scenes.router)
app.include_router(schedule.router)
app.include_router(control.router)
app.include_router(logs.router)
