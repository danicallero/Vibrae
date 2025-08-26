# player.py
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import random
import threading
import time
import vlc
import logging
from typing import List, Optional, Tuple
from backend.routes.control import notify_from_player

logger = logging.getLogger("garden_music.player")


def _now() -> float:
    return time.monotonic()


class Player:
    def __init__(self, music_base_dir: str):
        self.music_base_dir = music_base_dir
        self.current_folder: Optional[str] = None
        self.current_volume = 100
        self.queue: List[str] = []
        self.queue_pos = 0
        self.crossfade_sec = 5

        # Threading
        self._stop_event = threading.Event()
        self._switch_scene_request: Optional[Tuple[str, Optional[int]]] = None
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._play_epoch = 0  # monotonic token for active song/crossfade session

        # VLC players (owned by playback thread)
        self._vlc_instance = vlc.Instance()
        self._player_main: Optional[vlc.MediaPlayer] = None
        self._player_next: Optional[vlc.MediaPlayer] = None
        self._next_index_pending: Optional[int] = None

        self.now_playing: Optional[str] = None

        # Stop control (soft stop)
        self._pending_stop = False
        self._pending_stop_deadline: Optional[float] = None
        self._stop_after_song = False

        # Guards
        self._last_started_path: Optional[str] = None
        self._last_started_t: float = 0.0
        self._same_start_guard_sec = 1.5
        self._crossfade_active = False
        self._started_next_paths = set()

        # Handoff tracking to prevent duplicate starts
        self._handoff_in_progress = False
        self._last_handoff_main_id: Optional[int] = None
        # Short guard period after a promotion to avoid races where outer loop
        # instantaneously re-creates a player for the same track.
        self._promotion_guard_until: float = 0.0

    @staticmethod
    def _same_track(a: Optional[str], b: Optional[str]) -> bool:
        if not a or not b:
            return False
        try:
            return os.path.samefile(a, b)
        except Exception:
            return os.path.realpath(a) == os.path.realpath(b)

    def _load_and_shuffle(self, folder: str):
        folder_path = os.path.join(self.music_base_dir, folder)
        if not os.path.exists(folder_path):
            logger.warning(f"Folder '{folder_path}' does not exist.")
            self.queue = []
            return
        files: List[str] = []
        seen = set()
        for f in os.listdir(folder_path):
            if f.lower().endswith((".mp3", ".wav", ".ogg")):
                p = os.path.realpath(os.path.join(folder_path, f))
                if p not in seen:
                    seen.add(p)
                    files.append(p)
        random.shuffle(files)
        self.queue = files
        self.queue_pos = 0
        logger.info(f"Loaded and shuffled {len(files)} files from {folder_path}")

    def _get_song_length(self, song: str) -> float:
        DEFAULT = 180.0
        try:
            media = self._vlc_instance.media_new(song)
            try:
                media.parse()
            except Exception:
                try:
                    media.parse_with_options(vlc.MediaParseFlag.local, timeout=5)
                except Exception:
                    pass
            for _ in range(10):
                length_ms = media.get_duration()
                if length_ms and length_ms > 0:
                    length = length_ms / 1000.0
                    logger.debug(f"Length of '{song}': {length} seconds")
                    return length
                time.sleep(0.05)
            logger.warning(f"Could not get positive length for '{song}'. Using default {DEFAULT}s.")
            return DEFAULT
        except Exception as e:
            logger.warning(f"Could not get length for '{song}': {e}. Using default {DEFAULT}s.")
            return DEFAULT

    def _pick_next_distinct_index(self, current_index: int) -> Optional[int]:
        if not self.queue:
            return None
        n = len(self.queue)
        if n <= 1:
            return None
        current = self.queue[current_index]
        for step in range(1, n):
            idx = (current_index + step) % n
            cand = self.queue[idx]
            if not self._same_track(current, cand):
                return idx
        return None

    def set_volume(self, volume: int):
        new_volume = max(0, min(volume, 100))
        self.current_volume = new_volume
        for p in (self._player_main, self._player_next):
            if p is None:
                continue
            try:
                state = p.get_state()
                if state not in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error):
                    p.audio_set_volume(new_volume)
            except Exception as e:
                logger.debug(f"Error setting volume: {e}")

    def get_volume(self) -> int:
        return self.current_volume

    def play_scene(self, folder: str, volume: Optional[int] = None):
        with self._lock:
            if self._thread and self._thread.is_alive():
                self.stop(force=True)
            self.current_folder = folder
            if volume is not None:
                self.set_volume(volume)
            self._load_and_shuffle(folder)
            self._stop_event.clear()
            self._pending_stop = False
            self._pending_stop_deadline = None
            self._stop_after_song = False
            self._thread = threading.Thread(target=self._play_loop, daemon=True)
            self._thread.start()
            logger.info(f"Started playback thread for scene '{folder}'")

    def switch_scene(self, folder: str, volume: Optional[int] = None):
        with self._lock:
            self._switch_scene_request = (folder, volume)
            self._next_index_pending = None
            try:
                if self._player_next:
                    try:
                        self._player_next.stop()
                    except Exception:
                        pass
                    self._player_next = None
            except Exception:
                pass
            self._crossfade_active = False
            try:
                self._started_next_paths.clear()
            except Exception:
                pass
            self._handoff_in_progress = False
            self._last_handoff_main_id = None
            self._promotion_guard_until = 0.0
            logger.info(f"Scene switch requested to '{folder}'")

    def stop(self, force: bool = True):
        self._stop_event.set()
        self._pending_stop = False
        self._pending_stop_deadline = None
        self._stop_after_song = False
        self._handoff_in_progress = False
        self._last_handoff_main_id = None
        self._promotion_guard_until = 0.0
        if force and self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=2)
            except Exception:
                pass
        logger.info("Stop requested")

    def stop_after_current_or_timeout(self, timeout_sec=300):
        self._pending_stop = True
        self._stop_after_song = True
        self._pending_stop_deadline = _now() + max(0, timeout_sec)

    def get_now_playing(self) -> Optional[str]:
        return self.now_playing

    def is_playing(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and self.now_playing)

    def _play_loop(self):
        idle_since: Optional[float] = None
        try:
            while not self._stop_event.is_set():
                if self._pending_stop and self._pending_stop_deadline and _now() >= self._pending_stop_deadline:
                    logger.info("Pending stop deadline reached before next song — exiting loop.")
                    break

                with self._lock:
                    if self._switch_scene_request:
                        folder, volume = self._switch_scene_request
                        self._switch_scene_request = None
                        self.current_folder = folder
                        if volume is not None:
                            self.set_volume(volume)
                        self._load_and_shuffle(folder)
                        self.queue_pos = 0
                        self._next_index_pending = None
                        try:
                            self._started_next_paths.clear()
                        except Exception:
                            pass
                        logger.info(f"Switched scene to '{folder}' in loop")

                if not self.queue:
                    if idle_since is None:
                        idle_since = _now()
                    elif _now() - idle_since > 10:
                        logger.info("Queue has been empty for >10s — exiting loop.")
                        break
                    time.sleep(0.2)
                    continue
                else:
                    idle_since = None

                if self._pending_stop and self._stop_after_song and not self.now_playing:
                    logger.info("Stop-after-song requested and previous song finished — exiting loop.")
                    break

                song = self.queue[self.queue_pos]
                next_index = self._pick_next_distinct_index(self.queue_pos)
                next_song = self.queue[next_index] if next_index is not None else None

                # Defensive skip: if current main player is already actively playing this file
                try:
                    state_main = None
                    main_id = id(self._player_main) if self._player_main is not None else None
                    if self._player_main is not None:
                        try:
                            state_main = self._player_main.get_state()
                        except Exception:
                            state_main = None
                    active = state_main not in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error, None)

                    # Don't start a new main if we literally just promoted an already-active player
                    if main_id is not None and self._last_handoff_main_id is not None and main_id == self._last_handoff_main_id and _now() < self._promotion_guard_until:
                        logger.debug(f"Promotion guard active for main_id={main_id}; skipping start.")
                        time.sleep(0.05)
                        continue

                    if active and self._same_track(self.now_playing, song):
                        logger.info(f"Defensive skip: main player (id={main_id}) already active for {song}.")
                        self._last_handoff_main_id = main_id
                        time.sleep(0.1)
                        continue
                except Exception:
                    logger.debug("Error during defensive skip check", exc_info=True)

                self.now_playing = song
                notify_from_player(song, self.current_volume)
                logger.info(f"Now starting song at queue_pos={self.queue_pos}: {song}")

                self._handoff_in_progress = False

                self._play_song_non_blocking(song, next_song)

                if self._handoff_in_progress:
                    logger.info("Loop detected handoff_in_progress; not advancing queue in loop.")
                    self._handoff_in_progress = False
                    continue

                if self._pending_stop or self._stop_event.is_set():
                    logger.info("Stop active after song finished — exiting loop.")
                    break

                with self._lock:
                    if self.queue:
                        if self._next_index_pending is not None:
                            logger.debug(f"Advancing queue_pos to pending index {self._next_index_pending}")
                            self.queue_pos = self._next_index_pending
                            self._next_index_pending = None
                        else:
                            self.queue_pos = (self.queue_pos + 1) % len(self.queue)
                        if self.queue_pos == 0 and len(self.queue) > 1:
                            random.shuffle(self.queue)
                        logger.debug(f"Queue advanced to pos {self.queue_pos}")
        finally:
            try:
                notify_from_player(None)
            except Exception:
                pass
            for p in (self._player_main, self._player_next):
                if p is None:
                    continue
                try:
                    p.stop()
                except Exception:
                    pass
                try:
                    p.release()
                except Exception:
                    pass
            self._player_main = None
            self._player_next = None
            self._next_index_pending = None
            self.now_playing = None
            self._crossfade_active = False
            try:
                self._started_next_paths.clear()
            except Exception:
                pass
            self._handoff_in_progress = False
            self._last_handoff_main_id = None
            self._promotion_guard_until = 0.0
            logger.info("Playback loop exiting and cleaned up")

    def _fade_out_and_stop_sync(self, player: Optional[vlc.MediaPlayer], fade_sec: float = 0.5):
        if not player:
            return
        try:
            fade_time = max(0.0, float(fade_sec))
            steps = max(1, int(fade_time / 0.05))
            try:
                current_vol = max(player.audio_get_volume(), 0)
            except Exception:
                current_vol = 0
            for i in range(steps):
                try:
                    state = player.get_state()
                    if state in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error):
                        break
                except Exception:
                    break
                new_vol = int(round(max(0, min(100, current_vol * (1 - (i + 1) / steps)))))
                try:
                    player.audio_set_volume(new_vol)
                except Exception:
                    pass
                time.sleep(0.05)
            try:
                player.stop()
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"Error during fade_out: {e}")

    def _play_song_non_blocking(self, song: str, next_song: Optional[str], next_volume: Optional[int] = None):
        self._play_epoch += 1
        epoch = self._play_epoch
        try:
            self._started_next_paths.clear()
        except Exception:
            pass

        try:
            self._player_main = vlc.MediaPlayer(song)
            logger.debug(f"Created main MediaPlayer id={id(self._player_main)} for {song}")
        except Exception as e:
            logger.warning(f"Failed to create main player for {song}: {e}")
            self.now_playing = None
            return

        # ---- robust start sequence: no mute reliance, readiness wait ----
        try:
            self._player_main.audio_set_mute(False)
        except Exception:
            pass
        try:
            self._player_main.audio_set_volume(0)
        except Exception:
            pass
        try:
            self._player_main.play()
            logger.debug(f"Called play() on main id={id(self._player_main)}")
        except Exception:
            pass

        ready = False
        t0 = _now()
        while _now() - t0 < 1.5:
            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return
            try:
                st = self._player_main.get_state()
            except Exception:
                st = None
            time_ms = -1
            try:
                time_ms = self._player_main.get_time()
            except Exception:
                pass
            if st == vlc.State.Playing or (isinstance(time_ms, int) and time_ms > 0):
                ready = True
                break
            try:
                self._player_main.audio_set_mute(False)
            except Exception:
                pass
            try:
                self._player_main.audio_set_volume(0)
            except Exception:
                pass
            time.sleep(0.05)

        try:
            self._player_main.audio_set_mute(False)
        except Exception:
            pass
        try:
            self._player_main.audio_set_volume(0)
        except Exception:
            pass
        # ---- end start sequence ----

        # Initial fade-in
        for i in range(20):
            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return
            vol = int(round(max(0, min(100, self.current_volume * (i + 1) / 20))))
            try:
                self._player_main.audio_set_volume(vol)
            except Exception:
                pass
            try:
                self._player_main.audio_set_mute(False)
            except Exception:
                pass
            time.sleep(0.05)

        # Snap to exact target to avoid cumulative rounding drift
        try:
            self._player_main.audio_set_mute(False)
        except Exception:
            pass
        try:
            self._player_main.audio_set_volume(int(max(0, min(100, self.current_volume))))
        except Exception:
            pass

        song_length = self._get_song_length(song)
        crossfade_dur = max(0.1, float(self.crossfade_sec))
        fade_start = max(song_length - crossfade_dur, 1.0) if next_song else song_length
        start_time = _now()
        next_started = False
        next_player: Optional[vlc.MediaPlayer] = None
        fade_start_time = None

        terminal_states = (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error)

        while True:
            try:
                st_main = None
                if self._player_main is not None:
                    try:
                        st_main = self._player_main.get_state()
                    except Exception:
                        st_main = None
                if st_main in terminal_states:
                    logger.debug(f"Main player id={id(self._player_main)} entered terminal state {st_main}")
                    # If we have already started the next player and it is active (not terminal),
                    # promote it to become the main player instead of tearing it down.
                    try:
                        if next_started and next_player is not None:
                            try:
                                st_next = next_player.get_state()
                            except Exception:
                                st_next = None
                            if st_next not in terminal_states:
                                old_main_id = id(self._player_main) if self._player_main is not None else None
                                logger.info(f"Main entered terminal but next_player id={id(next_player)} is active; promoting to main")
                                self._player_main = next_player
                                with self._lock:
                                    if self._player_next is next_player:
                                        self._player_next = None
                                    self._crossfade_active = False
                                if self._next_index_pending is not None:
                                    self.queue_pos = self._next_index_pending
                                self._next_index_pending = None
                                self.now_playing = next_song
                                self._handoff_in_progress = True
                                self._last_handoff_main_id = id(self._player_main)
                                self._promotion_guard_until = _now() + 0.35
                                logger.info(f"Promoted next_player to main: new_main_id={self._last_handoff_main_id}, now_playing={self.now_playing}")

                                # IMPORTANT: snap volume to current target to avoid drift
                                try:
                                    self._player_main.audio_set_mute(False)
                                except Exception:
                                    pass
                                try:
                                    self._player_main.audio_set_volume(int(max(0, min(100, self.current_volume))))
                                except Exception:
                                    pass

                                # Reset timing for the promoted main
                                try:
                                    start_time = _now()
                                    song_length = self._get_song_length(self.now_playing)
                                    fade_start = max(song_length - crossfade_dur, 1.0) if next_song else song_length
                                    logger.debug(f"After promotion: reset start_time and song_length={song_length}, fade_start={fade_start}")
                                except Exception:
                                    start_time = _now()
                                    fade_start = _now() + 1.0

                                # Clear local next references
                                next_player = None
                                next_started = False
                                fade_start_time = None

                                notify_from_player(self.now_playing, self.current_volume)
                                continue
                    except Exception:
                        logger.debug("Error while promoting next_player", exc_info=True)
                    break
            except Exception:
                break

            elapsed = _now() - start_time

            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                if next_started and next_player:
                    self._fade_out_and_stop_sync(next_player, fade_sec=0.2)
                self.now_playing = None
                return

            if self._pending_stop and self._pending_stop_deadline and _now() >= self._pending_stop_deadline:
                logger.info("Pending stop deadline reached — stopping immediately.")
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                if next_started and next_player:
                    self._fade_out_and_stop_sync(next_player, fade_sec=0.2)
                self.now_playing = None
                return

            if self._pending_stop and not next_song and elapsed >= song_length - 0.25:
                logger.info("Song finished and pending stop requested — stopping now.")
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return

            if not next_started and next_song and elapsed >= fade_start:
                with self._lock:
                    if self._switch_scene_request is not None:
                        logger.info("Scene switch pending at crossfade gate — ending current without crossfade.")
                        next_song = None
                        self._next_index_pending = None
                        idx = None
                    else:
                        idx = self._pick_next_distinct_index(self.queue_pos)
                        if idx is not None:
                            cand = self.queue[idx]
                            recent_same = (
                                self._last_started_path is not None and
                                self._same_track(self._last_started_path, cand) and
                                (_now() - self._last_started_t) < self._same_start_guard_sec
                            )
                            try:
                                if not recent_same and os.path.realpath(cand) in self._started_next_paths:
                                    recent_same = True
                            except Exception:
                                pass
                            if recent_same or self._same_track(self.now_playing, cand):
                                logger.debug(f"Skipping candidate {cand} at crossfade gate because it's recent/same.")
                                idx = None

                        next_song = self.queue[idx] if idx is not None else None
                        self._next_index_pending = idx

                if not next_song or self._stop_event.is_set() or epoch != self._play_epoch or self._pending_stop:
                    logger.info("No distinct next or stop pending at gate — ending current without crossfade.")
                    self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                    self.now_playing = None
                    return

                try:
                    rp = os.path.realpath(next_song)
                    if rp in self._started_next_paths:
                        logger.info(f"Next song {next_song} was already started earlier in this epoch; skipping crossfade.")
                        self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                        self.now_playing = None
                        return
                except Exception:
                    pass

                candidate_player = None
                try:
                    candidate_player = vlc.MediaPlayer(next_song)
                    logger.debug(f"Created candidate next MediaPlayer id={id(candidate_player)} for {next_song}")
                    try:
                        candidate_player.audio_set_volume(0)
                    except Exception:
                        pass
                    try:
                        candidate_player.audio_set_mute(True)
                    except Exception:
                        pass
                except Exception as e:
                    logger.warning(f"Failed creating candidate next player for {next_song}: {e}")
                    candidate_player = None

                if candidate_player is not None:
                    with self._lock:
                        if self._player_next is None and not self._crossfade_active and self._next_index_pending == idx:
                            self._player_next = candidate_player
                            next_player = candidate_player
                            self._crossfade_active = True
                        else:
                            logger.debug("Candidate lost race to another crossfade owner; discarding candidate.")
                            next_player = None

                    if next_player is None:
                        try:
                            candidate_player.stop()
                        except Exception:
                            pass
                        try:
                            candidate_player.release()
                        except Exception:
                            pass
                    else:
                        if self._stop_event.is_set() or epoch != self._play_epoch:
                            try:
                                next_player.stop()
                            except Exception:
                                pass
                            with self._lock:
                                if self._player_next is next_player:
                                    self._player_next = None
                                    self._next_index_pending = None
                                    self._crossfade_active = False
                            try:
                                next_player.release()
                            except Exception:
                                pass
                            next_player = None
                        else:
                            try:
                                next_player.play()
                                logger.debug(f"Called play() on next id={id(next_player)}")
                                t1 = _now()
                                while _now() - t1 < 2.0:
                                    if self._stop_event.is_set() or epoch != self._play_epoch:
                                        break
                                    try:
                                        st_next = next_player.get_state()
                                        if st_next not in terminal_states:
                                            break
                                    except Exception:
                                        break
                                    time.sleep(0.05)
                                try:
                                    next_player.audio_set_volume(0)
                                except Exception:
                                    pass
                                try:
                                    next_player.audio_set_mute(False)
                                except Exception:
                                    pass

                                try:
                                    self._started_next_paths.add(os.path.realpath(next_song))
                                except Exception:
                                    pass

                                next_started = True
                                fade_start_time = _now()
                                self._last_started_path = next_song
                                self._last_started_t = _now()
                                logger.info(f"Next player started for {next_song} (obj={id(next_player)})")
                            except Exception as e:
                                logger.warning(f"Failed to start next player for {next_song}: {e}")
                                with self._lock:
                                    if self._player_next is next_player:
                                        self._player_next = None
                                        self._next_index_pending = None
                                        self._crossfade_active = False
                                try:
                                    next_player.stop()
                                except Exception:
                                    pass
                                try:
                                    next_player.release()
                                except Exception:
                                    pass
                                next_player = None

            if next_started and next_player and fade_start_time is not None:
                fade_elapsed = _now() - fade_start_time
                ratio = min(max(fade_elapsed / crossfade_dur, 0.0), 1.0)
                try:
                    self._player_main.audio_set_volume(int(round(max(0, min(100, self.current_volume * (1 - ratio))))))
                except Exception:
                    pass
                target_vol = next_volume if next_volume is not None else self.current_volume
                target_vol = max(0, min(100, int(target_vol)))
                try:
                    next_player.audio_set_volume(int(round(max(0, min(100, target_vol * ratio)))))
                except Exception:
                    pass
                if ratio >= 1.0:
                    try:
                        self._player_main.stop()
                    except Exception:
                        pass
                    old_main_id = id(self._player_main) if self._player_main is not None else None
                    self._player_main = next_player
                    new_main_id = id(self._player_main) if self._player_main is not None else None
                    with self._lock:
                        if self._player_next is next_player:
                            self._player_next = None
                        self._crossfade_active = False
                    if self._next_index_pending is not None:
                        self.queue_pos = self._next_index_pending
                    self._next_index_pending = None
                    self.now_playing = next_song

                    # mark that a successful handoff happened
                    self._handoff_in_progress = True
                    self._last_handoff_main_id = new_main_id
                    self._promotion_guard_until = _now() + 0.35
                    logger.info(f"Crossfade handoff complete: old_main_id={old_main_id}, new_main_id={new_main_id}, now_playing={self.now_playing}")

                    # SNAP to exact target to eliminate any rounding drift
                    try:
                        self._player_main.audio_set_mute(False)
                    except Exception:
                        pass
                    try:
                        self._player_main.audio_set_volume(int(max(0, min(100, target_vol))))
                    except Exception:
                        pass

                    next_player = None
                    notify_from_player(self.now_playing, target_vol)
            time.sleep(0.05)

        try:
            if self._player_main:
                logger.debug(f"Stopping main player id={id(self._player_main)} for {song}")
                self._player_main.stop()
        except Exception:
            pass
        with self._lock:
            if self._player_next is not None:
                try:
                    self._player_next.stop()
                except Exception:
                    pass
                try:
                    self._player_next.release()
                except Exception:
                    pass
                self._player_next = None
            self._crossfade_active = False
            self._next_index_pending = None
        return