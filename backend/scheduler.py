# scheduler.py
# SPDX-License-Identifier: GPL-3.0-or-later

import threading
import time
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from backend.db import SessionLocal
from backend.models import Routine, Scene
from backend.player import Player

# Configure logger for scheduler
logger = logging.getLogger("garden_music.scheduler")

class Scheduler:
    def __init__(self, player: Player, poll_interval: int = 10):
        self.player = player
        self.poll_interval = poll_interval
        self._stop_event = threading.Event()
        self._thread = None

        # Track the last played routine/scene to avoid redundant commands
        self._last_scene_id = None
        self._last_routine_id = None
        self._last_scene = None
        self._last_routine = None

    def start(self):
        """Start the scheduler loop in a background thread."""
        logger.info("Scheduler thread started.")
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

    def resume_if_should_play(self):
        """Manually resume playback if a routine should currently be active."""
        now = datetime.now()
        routine, scene = self._get_current_routine_and_scene(now)
        if routine and scene:
            logger.info(f"Manual resume: playing scene '{scene.path}' at volume {routine.volume}")
            self.player.play_scene(scene.path, volume=routine.volume)
            self._last_scene_id = scene.id
            self._last_routine_id = routine.id
            self._last_scene = scene
            self._last_routine = routine

    def stop(self):
        """Stop the scheduler thread."""
        logger.info("Scheduler thread stopped.")
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)

    def _run(self):
        """Main scheduler loop: checks routines and updates player accordingly."""
        no_match_logged = False

        while not self._stop_event.is_set():
            now = datetime.now()
            routine, scene = self._get_current_routine_and_scene(now)

            if routine and scene:
                no_match_logged = False
                # Ensure scene is up-to-date from DB before playing
                db = SessionLocal()
                try:
                    latest_scene = db.query(Scene).filter(Scene.id == scene.id).first()
                finally:
                    db.close()
                
                #TODO: rethink the whole stop system. If client is modifying a routine to make it longer and stop event was already sent, this will prevent schedule run
                if routine.id == self._last_routine_id and not self.player.is_playing():
                    continue  # don't restart same routine if stopped

                elif not self.player.is_playing(): #start playback
                    logger.info(f"Starting playback: scene '{latest_scene.path}' at volume {routine.volume}")
                    self.player.play_scene(latest_scene.path, volume=routine.volume)
                    self._last_scene_id = latest_scene.id
                    self._last_routine_id = routine.id

                elif routine.id != self._last_routine_id: #switch routine
                    logger.info(f"New routine matched (id={routine.id}): playing scene '{latest_scene.path}' at volume {routine.volume}")
                    self.player.switch_scene(latest_scene.path, volume=routine.volume)
                    self._last_scene_id = latest_scene.id
                    self._last_routine_id = routine.id

                elif scene.id != self._last_scene_id: #switch scene among same routine
                    logger.info(f"Scene change within same routine (id={routine.id}): switching to scene '{latest_scene.path}'")
                    self.player.switch_scene(latest_scene.path)
                    self._last_scene_id = latest_scene.id

                else:
                    logger.debug("Same routine and scene still active — no action taken.")

            else:
                if self._last_routine_id is not None:
                    logger.info("No routine matched anymore — stopping playback after current song or 5 minutes.")
                    self.player.stop_after_current_or_timeout(timeout_sec=300)
                    self._last_routine_id = None
                    self._last_scene_id = None
                
                if not no_match_logged:
                    logger.warning("No matching routine found. No music will play.")
                    no_match_logged = True

            time.sleep(self.poll_interval)

    def _get_current_routine_and_scene(self, now: datetime):
        """Check the database for a routine that matches the current time."""
        db: Session = SessionLocal()
        try:
            routines = db.query(Routine).all()
            for routine in routines:
                if self._routine_matches(routine, now):
                    # Get the latest scene for the matched routine
                    scene = db.query(Scene).filter(Scene.id == routine.scene_id).first()
                    db.refresh(scene)
                    return routine, scene
            return None, None
        finally:
            db.close()

    def _routine_matches(self, routine: Routine, now: datetime) -> bool:
        """Determine if the given routine matches the current date/time."""
        start = routine.start_time
        end = routine.end_time
        now_str = now.strftime('%H:%M')

        logger.debug(
            f"Checking routine id={routine.id}: now={now_str}, start={start}, end={end}, "
            f"weekdays={routine.weekdays}, months={routine.months}"
        )

        # --- Time check (handles overnight schedules) ---
        if start < end:
            in_time = start <= now_str < end
        else:
            # Overnight range: e.g., 22:00 - 06:00
            in_time = now_str >= start or now_str < end
        if not in_time:
            logger.debug(f"Routine id={routine.id} does not match time: now={now_str}, start={start}, end={end}")
            return False

        # --- Weekday check ---
        if routine.weekdays:
            weekdays = [w.strip().lower()[:3] for w in routine.weekdays.split(',') if w.strip()]
            weekday_now = now.strftime('%a').lower()[:3]
            logger.debug(f"Routine id={routine.id} weekday check: now={weekday_now}, allowed={weekdays}")
            if weekday_now not in weekdays:
                logger.debug(f"Routine id={routine.id} does not match weekday: now={weekday_now}, allowed={weekdays}")
                return False

        # --- Month check ---
        if routine.months:
            months = [m.strip().lower()[:3] for m in routine.months.split(',') if m.strip()]
            month_now = now.strftime('%b').lower()[:3]
            logger.debug(f"Routine id={routine.id} month check: now={month_now}, allowed={months}")
            if month_now not in months:
                logger.debug(f"Routine id={routine.id} does not match month: now={month_now}, allowed={months}")
                return False

        logger.debug(f"Routine id={routine.id} matches!")
        return True