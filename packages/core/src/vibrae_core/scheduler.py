"""Scheduler service migrated from legacy backend.scheduler.

Polls DB for matching routine and orchestrates player scene playback.
"""
from __future__ import annotations

import threading
import time
import logging
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from vibrae_core.db import SessionLocal
from vibrae_core.models import Routine, Scene
from vibrae_core.player import Player

logger = logging.getLogger("vibrae_core.scheduler")


class Scheduler:
    def __init__(self, player: Player, poll_interval: int = 10):
        self.player = player
        self.poll_interval = poll_interval
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._last_scene_id: Optional[int] = None
        self._last_routine_id: Optional[int] = None
        self._last_scene: Optional[Scene] = None
        self._last_routine: Optional[Routine] = None

    def is_initialized(self) -> bool:
        return self._thread is not None or not self._stop_event.is_set()

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and not self._stop_event.is_set()

    def start(self):
        logger.info("Scheduler thread start requested")
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def resume_if_should_play(self):
        now = datetime.now()
        routine, scene = self._get_current_routine_and_scene(now)
        if routine and scene:
            logger.info(f"Manual resume: playing scene '{scene.path}' vol={routine.volume}")
            self.player.play_scene(scene.path, volume=routine.volume)
            self._last_scene_id = scene.id
            self._last_routine_id = routine.id
            self._last_scene = scene
            self._last_routine = routine

    def stop(self):
        logger.info("Scheduler thread stop requested")
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)

    def _run(self):  # pragma: no cover (timing + thread loop)
        no_match_logged = False
        while not self._stop_event.is_set():
            now = datetime.now()
            routine, scene = self._get_current_routine_and_scene(now)

            if routine and scene:
                no_match_logged = False
                db = SessionLocal()
                try:
                    latest_scene = db.query(Scene).filter(Scene.id == scene.id).first()
                finally:
                    db.close()

                if routine.id == self._last_routine_id and not self.player.is_playing():
                    pass
                elif not self.player.is_playing():
                    logger.info(f"Starting playback: scene '{latest_scene.path}' vol={routine.volume}")
                    self.player.play_scene(latest_scene.path, volume=routine.volume)
                    self._last_scene_id = latest_scene.id
                    self._last_routine_id = routine.id
                elif routine.id != self._last_routine_id:
                    logger.info(f"New routine {routine.id}: scene '{latest_scene.path}' vol={routine.volume}")
                    self.player.switch_scene(latest_scene.path, volume=routine.volume)
                    self._last_scene_id = latest_scene.id
                    self._last_routine_id = routine.id
                elif scene.id != self._last_scene_id:
                    logger.info(f"Scene change same routine {routine.id} -> '{latest_scene.path}'")
                    self.player.switch_scene(latest_scene.path)
                    self._last_scene_id = latest_scene.id
            else:
                if self._last_routine_id is not None:
                    logger.info("Routine ended — soft stop after current or 5 min")
                    self.player.stop_after_current_or_timeout(timeout_sec=300)
                    self._last_routine_id = None
                    self._last_scene_id = None
                if not no_match_logged:
                    logger.warning("No matching routine; idle.")
                    no_match_logged = True

            time.sleep(self.poll_interval)

    def _get_current_routine_and_scene(self, now: datetime) -> Tuple[Optional[Routine], Optional[Scene]]:
        db: Session = SessionLocal()
        try:
            routines = db.query(Routine).all()
            for routine in routines:
                if self._routine_matches(routine, now):
                    scene = db.query(Scene).filter(Scene.id == routine.scene_id).first()
                    db.refresh(scene)
                    return routine, scene
            return None, None
        finally:
            db.close()

    def _routine_matches(self, routine: Routine, now: datetime) -> bool:
        start = routine.start_time
        end = routine.end_time
        now_str = now.strftime('%H:%M')

        if start < end:
            in_time = start <= now_str < end
        else:
            in_time = now_str >= start or now_str < end
        if not in_time:
            return False

        if routine.weekdays:
            weekdays = [w.strip().lower()[:3] for w in routine.weekdays.split(',') if w.strip()]
            weekday_now = now.strftime('%a').lower()[:3]
            if weekday_now not in weekdays:
                return False

        if routine.months:
            months = [m.strip().lower()[:3] for m in routine.months.split(',') if m.strip()]
            month_now = now.strftime('%b').lower()[:3]
            if month_now not in months:
                return False
        return True

__all__ = ["Scheduler"]
"""Scheduler service wrapper referencing legacy implementation."""
from __future__ import annotations
# Legacy import compatibility removed; use vibrae_core.scheduler.Scheduler directly
