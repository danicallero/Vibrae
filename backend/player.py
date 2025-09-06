"""Audio scene player with queue shuffle, smart crossfades, and scene switching.

Lightweight wrapper around VLC that manages a shuffled queue per scene, timed
crossfades, and safe handoffs (promotion) between overlapping media players.
"""
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import random
import threading
import time
import vlc
import logging
from dataclasses import dataclass
from enum import Enum, auto
from typing import Callable, List, Optional, Tuple
from backend.routes.control import notify_from_player

logger = logging.getLogger("garden_music.player")


def _now() -> float:
    return time.monotonic()


@dataclass
class PlaybackStatus:
    crossfade_active: bool = False
    handoff_in_progress: bool = False
    last_handoff_main_id: Optional[int] = None
    promotion_guard_until: float = 0.0


class PlayerPhase(Enum):
    IDLE = auto()
    PLAYING = auto()
    CROSSFADE = auto()


def wait_until(predicate: Callable[[], bool], timeout: float, poll: float = 0.05) -> bool:
    end = _now() + max(0.0, timeout)
    while _now() < end:
        try:
            if predicate():
                return True
        except Exception:
            pass
        time.sleep(poll)
    return False


def _safe_unmute(player) -> None:
    try:
        player.audio_set_mute(False)
    except Exception:
        pass


def _safe_set_volume(player, volume: int) -> None:
    try:
        player.audio_set_volume(int(max(0, min(100, volume))))
    except Exception:
        pass


def _safe_unmute_and_volume(player, volume: int) -> None:
    _safe_unmute(player)
    _safe_set_volume(player, volume)


class Player:
    def __init__(self, music_base_dir: str):
        self.music_base_dir = music_base_dir
        self.current_folder: Optional[str] = None
        self.current_volume = 100
        self.queue: List[str] = []
        self.queue_pos = 0
        self.crossfade_sec = 5
        self.promotion_guard_window = 0.35  # adjustable (e.g., tests)

        # Threading
        self._stop_event = threading.Event()
        self._switch_scene_request: Optional[Tuple[str, Optional[int]]] = None
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._play_epoch = 0

        # VLC
        self._vlc_instance = vlc.Instance()
        self._player_main: Optional[vlc.MediaPlayer] = None
        self._player_next: Optional[vlc.MediaPlayer] = None
        self._next_index_pending: Optional[int] = None

        self.now_playing: Optional[str] = None

        # Soft stop
        self._pending_stop = False
        self._pending_stop_deadline: Optional[float] = None
        self._stop_after_song = False

        # Guards / status
        self._last_started_path: Optional[str] = None
        self._last_started_t: float = 0.0
        self._same_start_guard_sec = 1.5
        self._started_next_paths = set()
        self._status = PlaybackStatus()

        # Backwards compat mirror flags
        self._crossfade_active = False
        self._handoff_in_progress = False
        self._last_handoff_main_id: Optional[int] = None
        self._promotion_guard_until: float = 0.0

    # ---------------- Public API ----------------
    def is_initialized(self) -> bool:
        try:
            return self._vlc_instance is not None
        except Exception:
            return False

    def set_volume(self, volume: int) -> None:
        new_volume = max(0, min(volume, 100))
        old_volume = self.current_volume
        self.current_volume = new_volume
        if old_volume != new_volume:
            logger.debug(f"Volume change requested {old_volume} -> {new_volume}")
        for p in (self._player_main, self._player_next):
            if p is None:
                continue
            try:
                st = p.get_state()
                if st not in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error):
                    _safe_set_volume(p, new_volume)
                    logger.debug(f"Applied volume={new_volume} to player id={id(p)} state={st}")
            except Exception:
                pass

    def get_volume(self) -> int:
        return self.current_volume

    def play_scene(self, folder: str, volume: Optional[int] = None) -> None:
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

    def switch_scene(self, folder: str, volume: Optional[int] = None) -> None:
        with self._lock:
            self._switch_scene_request = (folder, volume)
            self._next_index_pending = None
            if self._player_next:
                try:
                    self._player_next.stop()
                except Exception:
                    pass
                self._player_next = None
            self._status.crossfade_active = False
            self._started_next_paths.clear()
            self._status.handoff_in_progress = False
            self._status.last_handoff_main_id = None
            self._status.promotion_guard_until = 0.0
            logger.info(f"Scene switch requested to '{folder}'")

    def stop(self, force: bool = True) -> None:
        self._stop_event.set()
        self._pending_stop = False
        self._pending_stop_deadline = None
        self._stop_after_song = False
        self._status.handoff_in_progress = False
        self._status.last_handoff_main_id = None
        self._status.promotion_guard_until = 0.0
        if force and self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=2)
            except Exception:
                pass
        logger.info("Stop requested")

    def stop_after_current_or_timeout(self, timeout_sec: int = 300) -> None:
        self._pending_stop = True
        self._stop_after_song = True
        self._pending_stop_deadline = _now() + max(0, timeout_sec)

    def get_now_playing(self) -> Optional[str]:
        return self.now_playing

    def is_playing(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and self.now_playing)

    def get_phase(self) -> PlayerPhase:
        if self._status.crossfade_active:
            return PlayerPhase.CROSSFADE
        if self.now_playing:
            return PlayerPhase.PLAYING
        return PlayerPhase.IDLE

    def shutdown(self) -> None:
        self.stop(force=True)
        for p in (self._player_main, self._player_next):
            if not p:
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
        if self._vlc_instance is not None:
            try:
                self._vlc_instance.release()
            except Exception:
                pass
            self._vlc_instance = None
        logger.info("Player shutdown complete")

    # ---------------- Internal helpers ----------------
    @staticmethod
    def _same_track(a: Optional[str], b: Optional[str]) -> bool:
        if not a or not b:
            return False
        try:
            return os.path.samefile(a, b)
        except Exception:
            return os.path.realpath(a) == os.path.realpath(b)

    def _load_and_shuffle(self, folder: str) -> None:
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
                    return length_ms / 1000.0
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

    def _fade_out_and_stop_sync(self, player: Optional[vlc.MediaPlayer], fade_sec: float = 0.5) -> None:
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
                _safe_set_volume(player, new_vol)
                time.sleep(0.05)
            try:
                player.stop()
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"Error during fade_out: {e}")

    # ---------------- Playback Loop ----------------
    def _play_loop(self) -> None:
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
                        self._started_next_paths.clear()
                        logger.info(f"Switched scene to '{folder}' in loop")

                if not self.queue:
                    if idle_since is None:
                        idle_since = _now()
                    elif _now() - idle_since > 10:
                        logger.info("Queue empty >10s — exiting loop.")
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

                # Defensive skip
                try:
                    main_id = id(self._player_main) if self._player_main else None
                    active = False
                    if self._player_main:
                        try:
                            st = self._player_main.get_state()
                        except Exception:
                            st = None
                        active = st not in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error, None)
                    if (main_id is not None and self._status.last_handoff_main_id is not None and
                            main_id == self._status.last_handoff_main_id and _now() < self._status.promotion_guard_until):
                        logger.debug(f"Promotion guard active for main_id={main_id}; skipping start.")
                        time.sleep(0.05)
                        continue
                    if active and self._same_track(self.now_playing, song):
                        logger.info(f"Defensive skip: main player already active for {song}.")
                        self._status.last_handoff_main_id = main_id
                        time.sleep(0.1)
                        continue
                except Exception:
                    logger.debug("Error during defensive skip check", exc_info=True)

                self.now_playing = song
                notify_from_player(song, self.current_volume)
                logger.info(f"Now starting song at queue_pos={self.queue_pos}: {song}")
                self._status.handoff_in_progress = False

                self._play_song_non_blocking(song, next_song)

                if self._status.handoff_in_progress:
                    logger.info("Loop detected handoff_in_progress; not advancing queue in loop.")
                    self._status.handoff_in_progress = False
                    continue

                if self._pending_stop or self._stop_event.is_set():
                    logger.info("Stop active after song finished — exiting loop.")
                    break

                with self._lock:
                    if self.queue:
                        if self._next_index_pending is not None:
                            self.queue_pos = self._next_index_pending
                            self._next_index_pending = None
                        else:
                            self.queue_pos = (self.queue_pos + 1) % len(self.queue)
                        if self.queue_pos == 0 and len(self.queue) > 1:
                            random.shuffle(self.queue)
        finally:
            try:
                notify_from_player(None)
            except Exception:
                pass
            for p in (self._player_main, self._player_next):
                if not p:
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
            self._status.crossfade_active = False
            self._started_next_paths.clear()
            self._status.handoff_in_progress = False
            self._status.last_handoff_main_id = None
            self._status.promotion_guard_until = 0.0
            logger.info("Playback loop exiting and cleaned up")

    # ---------------- Song playback + crossfade ----------------
    def _play_song_non_blocking(self, song: str, next_song: Optional[str], next_volume: Optional[int] = None) -> None:
        self._play_epoch += 1
        epoch = self._play_epoch
        self._started_next_paths.clear()

        try:
            self._player_main = vlc.MediaPlayer(song)
            logger.debug(f"Created main MediaPlayer id={id(self._player_main)} for {song}")
        except Exception as e:
            logger.warning(f"Failed to create main player for {song}: {e}")
            self.now_playing = None
            return

        _safe_unmute_and_volume(self._player_main, 0)
        try:
            self._player_main.play()
        except Exception:
            pass

        def _main_ready() -> bool:
            if self._stop_event.is_set() or epoch != self._play_epoch:
                return True
            try:
                st = self._player_main.get_state()
            except Exception:
                st = None
            try:
                tms = self._player_main.get_time()
            except Exception:
                tms = -1
            return st == vlc.State.Playing or (isinstance(tms, int) and tms > 0)

        wait_until(_main_ready, 1.5, poll=0.05)
        _safe_unmute_and_volume(self._player_main, 0)

        # Fade-in
        for i in range(20):
            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return
            vol = int(round(self.current_volume * (i + 1) / 20))
            _safe_unmute_and_volume(self._player_main, vol)
            time.sleep(0.05)

        _safe_unmute_and_volume(self._player_main, self.current_volume)

        song_length = self._get_song_length(song)
        crossfade_dur = max(0.1, float(self.crossfade_sec))
        fade_start = max(song_length - crossfade_dur, 1.0) if next_song else song_length
        start_time = _now()
        next_started = False
        next_player: Optional[vlc.MediaPlayer] = None
        fade_start_time: Optional[float] = None
        terminal_states = (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error)

        def crossfade_step(main_player, next_player_local, ratio_local, target_vol_local) -> bool:
            _safe_set_volume(main_player, int(round(self.current_volume * (1 - ratio_local))))
            target_vol_local = max(0, min(100, int(target_vol_local)))
            _safe_set_volume(next_player_local, int(round(target_vol_local * ratio_local)))
            if ratio_local >= 1.0:
                try:
                    main_player.stop()
                except Exception:
                    pass
                self._player_main = next_player_local
                with self._lock:
                    if self._player_next is next_player_local:
                        self._player_next = None
                    self._status.crossfade_active = False
                if self._next_index_pending is not None:
                    self.queue_pos = self._next_index_pending
                self._next_index_pending = None
                self.now_playing = next_song
                self._status.handoff_in_progress = True
                new_main_id = id(self._player_main)
                self._status.last_handoff_main_id = new_main_id
                self._status.promotion_guard_until = _now() + self.promotion_guard_window
                _safe_unmute_and_volume(self._player_main, target_vol_local)
                notify_from_player(self.now_playing, target_vol_local)
                logger.info(f"Crossfade complete -> main id={new_main_id}: {self.now_playing}")
                return True
            return False

        while True:
            # Terminal state promotion before crossfade
            try:
                st_main = None
                if self._player_main is not None:
                    try:
                        st_main = self._player_main.get_state()
                    except Exception:
                        st_main = None
                if st_main in terminal_states:
                    if next_started and next_player is not None:
                        try:
                            st_next = next_player.get_state()
                        except Exception:
                            st_next = None
                        if st_next not in terminal_states:
                            self._player_main = next_player
                            with self._lock:
                                if self._player_next is next_player:
                                    self._player_next = None
                                self._status.crossfade_active = False
                            if self._next_index_pending is not None:
                                self.queue_pos = self._next_index_pending
                            self._next_index_pending = None
                            self.now_playing = next_song
                            self._status.handoff_in_progress = True
                            self._status.last_handoff_main_id = id(self._player_main)
                            self._status.promotion_guard_until = _now() + self.promotion_guard_window
                            _safe_unmute_and_volume(self._player_main, self.current_volume)
                            try:
                                start_time = _now()
                                song_length = self._get_song_length(self.now_playing)
                                fade_start = max(song_length - crossfade_dur, 1.0) if next_song else song_length
                            except Exception:
                                start_time = _now()
                                fade_start = _now() + 1.0
                            next_player = None
                            next_started = False
                            fade_start_time = None
                            notify_from_player(self.now_playing, self.current_volume)
                            continue
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
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                if next_started and next_player:
                    self._fade_out_and_stop_sync(next_player, fade_sec=0.2)
                self.now_playing = None
                return
            if self._pending_stop and not next_song and elapsed >= song_length - 0.25:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return

            if not next_started and next_song and elapsed >= fade_start:
                with self._lock:
                    if self._switch_scene_request is not None:
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
                                idx = None
                        next_song = self.queue[idx] if idx is not None else None
                        self._next_index_pending = idx
                        if next_song is not None:
                            logger.info(f"Crossfade candidate selected idx={idx} path={next_song}")
                        else:
                            logger.info("No suitable next track found (will end without crossfade)")

                if not next_song or self._stop_event.is_set() or epoch != self._play_epoch or self._pending_stop:
                    self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                    logger.info("Playback ended early (no next track or stop condition) before crossfade")
                    self.now_playing = None
                    return

                try:
                    if os.path.realpath(next_song) in self._started_next_paths:
                        self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                        logger.info("Duplicate next track detected; ending current song without crossfade")
                        self.now_playing = None
                        return
                except Exception:
                    pass

                candidate_player = None
                try:
                    candidate_player = vlc.MediaPlayer(next_song)
                    _safe_unmute_and_volume(candidate_player, 0)
                except Exception as e:
                    logger.warning(f"Failed creating candidate next player for {next_song}: {e}")
                    candidate_player = None

                if candidate_player is not None:
                    with self._lock:
                        if self._player_next is None and not self._status.crossfade_active and self._next_index_pending == self._next_index_pending:
                            self._player_next = candidate_player
                            next_player = candidate_player
                            self._status.crossfade_active = True
                        else:
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
                        logger.info(f"Crossfade starting: from='{song}' to='{next_song}' duration={crossfade_dur:.2f}s")
                        if self._stop_event.is_set() or epoch != self._play_epoch:
                            try:
                                next_player.stop()
                            except Exception:
                                pass
                            with self._lock:
                                if self._player_next is next_player:
                                    self._player_next = None
                                    self._next_index_pending = None
                                    self._status.crossfade_active = False
                            try:
                                next_player.release()
                            except Exception:
                                pass
                            next_player = None
                        else:
                            try:
                                next_player.play()
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
                                _safe_unmute_and_volume(next_player, 0)
                                try:
                                    self._started_next_paths.add(os.path.realpath(next_song))
                                except Exception:
                                    pass
                                next_started = True
                                fade_start_time = _now()
                                self._last_started_path = next_song
                                self._last_started_t = _now()
                            except Exception:
                                with self._lock:
                                    if self._player_next is next_player:
                                        self._player_next = None
                                        self._next_index_pending = None
                                        self._status.crossfade_active = False
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
                target_vol = next_volume if next_volume is not None else self.current_volume
                # Log coarse progress buckets (0%,25%,50%,75%,100%) to avoid log spam
                try:
                    if 'last_ratio_bucket' not in locals():
                        last_ratio_bucket = -1  # type: ignore
                    bucket = int(ratio * 100) // 25 * 25
                    if bucket != last_ratio_bucket:
                        logger.debug(f"Crossfade progress {bucket}% ratio={ratio:.2f}")
                        last_ratio_bucket = bucket  # type: ignore
                except Exception:
                    pass
                if crossfade_step(self._player_main, next_player, ratio, target_vol):
                    next_player = None
            time.sleep(0.05)

        try:
            if self._player_main:
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
            self._status.crossfade_active = False
            self._next_index_pending = None
        return