import os
import random
import threading
import time
import vlc
import logging
from typing import List, Optional, Tuple
from backend.routes.control import notify_from_player

logger = logging.getLogger("garden_music.player")
logging.basicConfig(
    filename="garden_music.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)


def _now() -> float:
    # monotonic in case system clock jumps
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
        # index of pending "next" in queue to avoid starting multiple next players
        self._next_index_pending: Optional[int] = None

        self.now_playing: Optional[str] = None

        # Stop control (soft stop)
        self._pending_stop = False
        self._pending_stop_deadline: Optional[float] = None
        self._stop_after_song = False

        # Extra guard against accidental same-track double start within crossfade window
        self._last_started_path: Optional[str] = None
        self._last_started_t: float = 0.0
        self._same_start_guard_sec = 1.5

        # Crossfade single-start guard: ensures we never attempt to start >1 "next" concurrently
        self._crossfade_active = False

        # Per-epoch set of realpaths that have already been started as "next".
        # If a path was started once during the current epoch we will never start it again
        self._started_next_paths = set()

    # Utilities
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
                if p not in seen:  # de-duplicate by real path
                    seen.add(p)
                    files.append(p)
        random.shuffle(files)
        self.queue = files
        self.queue_pos = 0
        logger.info(f"Loaded and shuffled {len(files)} files from {folder_path}")

    def _get_song_length(self, song: str) -> float:
        """Try to obtain a positive duration; fallback to default."""
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
                    logger.info(f"Length of '{song}': {length} seconds")
                    return length
                time.sleep(0.05)
            logger.warning(f"Could not get positive length for '{song}'. Using default {DEFAULT}s.")
            return DEFAULT
        except Exception as e:
            logger.warning(f"Could not get length for '{song}': {e}. Using default {DEFAULT}s.")
            return DEFAULT

    def _pick_next_distinct_index(self, current_index: int) -> Optional[int]:
        """Return the next index in queue that points to a *different* track, else None."""
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

    # Public
    def set_volume(self, volume: int):
        new_volume = max(0, min(volume, 100))
        self.current_volume = new_volume
        # Best-effort; players are owned by playback thread, but adjusting volume is safe
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

    def switch_scene(self, folder: str, volume: Optional[int] = None):
        with self._lock:
            # Make request; handled in loop at safe points
            self._switch_scene_request = (folder, volume)
            # Cancel any queued next so we DO NOT start a crossfade into the old scene
            self._next_index_pending = None
            # Stop _player_next if it exists; don't release (owner thread will)
            try:
                if self._player_next:
                    try:
                        self._player_next.stop()
                    except Exception:
                        pass
                    self._player_next = None
            except Exception:
                pass
            # clear crossfade guard so future crossfades can start normally
            self._crossfade_active = False
            # also clear per-epoch started paths to avoid blocking next items after a scene switch
            try:
                self._started_next_paths.clear()
            except Exception:
                pass

    def stop(self, force: bool = True):
        """Hard stop: signal and (optionally) wait; cleanup happens in playback thread."""
        self._stop_event.set()
        # Clear soft-stop state to avoid queue advancement or crossfades
        self._pending_stop = False
        self._pending_stop_deadline = None
        self._stop_after_song = False
        if force and self._thread and self._thread.is_alive():
            try:
                self._thread.join(timeout=2)
            except Exception:
                pass

    def stop_after_current_or_timeout(self, timeout_sec=300):
        self._pending_stop = True
        self._stop_after_song = True
        self._pending_stop_deadline = _now() + max(0, timeout_sec)

    def get_now_playing(self) -> Optional[str]:
        return self.now_playing

    def is_playing(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and self.now_playing)

    # Main playback loop
    def _play_loop(self):
        idle_since: Optional[float] = None
        try:
            while not self._stop_event.is_set():
                # Handle soft stop timeout before selecting next song
                if self._pending_stop and self._pending_stop_deadline and _now() >= self._pending_stop_deadline:
                    logger.info("Pending stop deadline reached before next song — exiting loop.")
                    break

                # Scene switch
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

                # Compute candidate next (distinct) early; may be re-evaluated at crossfade gate
                next_index = self._pick_next_distinct_index(self.queue_pos)
                next_song = self.queue[next_index] if next_index is not None else None

                self.now_playing = song
                notify_from_player(song, self.current_volume)

                self._play_song_non_blocking(song, next_song)

                if self._pending_stop or self._stop_event.is_set():
                    logger.info("Stop active after song finished — exiting loop.")
                    break

                with self._lock:
                    if self.queue:
                        # Advance queue only after song finished and only if not stopping
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
            # Synchronous cleanup here, no releases elsewhere
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

    # Fading assist (sync)
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
                new_vol = int(max(0, min(100, current_vol * (1 - (i + 1) / steps))))
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

    # Core playback
    # Way too complex, but the most reliable way I got to prevent duplicate file starts...

    def _play_song_non_blocking(self, song: str, next_song: Optional[str], next_volume: Optional[int] = None):
        # Bump epoch to invalidate any concurrent starts
        self._play_epoch += 1
        epoch = self._play_epoch
        # fresh history for this epoch (session)
        try:
            self._started_next_paths.clear()
        except Exception:
            pass

        # Start main player (muted), owned by this thread, double-mute defense
        self._player_main = vlc.MediaPlayer(song)
        try:
            self._player_main.audio_set_volume(0)
        except Exception:
            pass
        try:
            self._player_main.audio_set_mute(True)
        except Exception:
            pass
        self._player_main.play()

        t0 = _now()
        while _now() - t0 < 2.0:
            if self._stop_event.is_set() or epoch != self._play_epoch:
                # stop quickly; don't start anything else
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return
            try:
                if self._player_main.get_state() == vlc.State.Playing:
                    break
            except Exception:
                break
            time.sleep(0.05)

        # Enforce zero volume right after start, then unmute and fade-in
        # Prevent sudden 100% volume on crossfade tick
        try:
            self._player_main.audio_set_volume(0)
        except Exception:
            pass
        try:
            self._player_main.audio_set_mute(False)
        except Exception:
            pass

        for i in range(20):
            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return
            vol = max(0, min(int(self.current_volume * (i + 1) / 20), 100))
            try:
                self._player_main.audio_set_volume(vol)
            except Exception:
                pass
            time.sleep(0.05)

        song_length = self._get_song_length(song)
        crossfade_dur = max(0.1, float(self.crossfade_sec))
        # only schedule crossfade if there's a distinct next track
        fade_start = max(song_length - crossfade_dur, 1.0) if next_song else song_length
        start_time = _now()
        next_started = False
        next_player: Optional[vlc.MediaPlayer] = None
        fade_start_time = None

        while True:
            # If main isn't playing anymore, we are done with this song
            try:
                if not self._player_main or self._player_main.get_state() != vlc.State.Playing:
                    break
            except Exception:
                break

            elapsed = _now() - start_time

            # Hard stop: fade out what we have and bail, never start next
            if self._stop_event.is_set() or epoch != self._play_epoch:
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                if next_started and next_player:
                    self._fade_out_and_stop_sync(next_player, fade_sec=0.2)
                self.now_playing = None
                return

            # Soft stop deadline hit while playing
            if self._pending_stop and self._pending_stop_deadline and _now() >= self._pending_stop_deadline:
                logger.info("Pending stop deadline reached — stopping immediately.")
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                if next_started and next_player:
                    self._fade_out_and_stop_sync(next_player, fade_sec=0.2)
                self.now_playing = None
                return

            # If soft stop requested and we reached end (no crossfade), end after this song
            if self._pending_stop and not next_song and elapsed >= song_length - 0.25:
                logger.info("Song finished and pending stop requested — stopping now.")
                self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                self.now_playing = None
                return

            # Crossfade gate (only once)
            if not next_started and next_song and elapsed >= fade_start:
                # Re-evaluate next track safely under lock and ensure it's DISTINCT
                with self._lock:
                    # If a scene switch was requested, honor it and don't start next
                    if self._switch_scene_request is not None:
                        logger.info("Scene switch pending at crossfade gate — ending current without crossfade.")
                        next_song = None
                        self._next_index_pending = None
                        idx = None
                    else:
                        # Recompute a distinct next index from current queue_pos
                        idx = self._pick_next_distinct_index(self.queue_pos)
                        if idx is not None:
                            cand = self.queue[idx]
                            # Extra guard: avoid starting the same path within a tiny window
                            recent_same = (
                                self._last_started_path is not None and
                                self._same_track(self._last_started_path, cand) and
                                (_now() - self._last_started_t) < self._same_start_guard_sec
                            )
                            # Also treat a candidate as recently started if we already started
                            # this exact file earlier in the same epoch, prevents restarting it.
                            try:
                                if not recent_same and os.path.realpath(cand) in self._started_next_paths:
                                    recent_same = True
                            except Exception:
                                pass
                            if recent_same or self._same_track(self.now_playing, cand):
                                logger.debug(f"Skipping candidate {cand} at crossfade gate because it's recent/same.")
                                idx = None

                        next_song = self.queue[idx] if idx is not None else None
                        # Mark the chosen index as pending so queue_pos advances correctly later
                        self._next_index_pending = idx

                # If we no longer have a next song or stop is active, end without crossfade
                if not next_song or self._stop_event.is_set() or epoch != self._play_epoch or self._pending_stop:
                    logger.info("No distinct next or stop pending at gate — ending current without crossfade.")
                    self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                    self.now_playing = None
                    return

                # Guard: if we already started this same realpath earlier in this epoch, refuse to start again
                try:
                    rp = os.path.realpath(next_song)
                    if rp in self._started_next_paths:
                        logger.info(f"Next song {next_song} was already started earlier in this epoch; skipping crossfade.")
                        self._fade_out_and_stop_sync(self._player_main, fade_sec=0.2)
                        self.now_playing = None
                        return
                except Exception:
                    pass

                # Create and prepare candidate next player (muted)
                candidate_player = None
                try:
                    candidate_player = vlc.MediaPlayer(next_song)
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
                    # Claim as official next under lock and set crossfade guard
                    with self._lock:
                        # double-check that no other crossfade is currently active and no _player_next
                        if self._player_next is None and not self._crossfade_active and self._next_index_pending == idx:
                            self._player_next = candidate_player
                            next_player = candidate_player
                            self._crossfade_active = True
                        else:
                            # Another crossfade/next won the race: discard our candidate
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
                        # Final stop/epoch checks right before starting to guarantee we don't "skip" on stop
                        if self._stop_event.is_set() or epoch != self._play_epoch:
                            # don't start it at all
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
                                # Start playback of next_player now that it's atomically claimed
                                next_player.play()
                                t1 = _now()
                                while _now() - t1 < 2.0:
                                    if self._stop_event.is_set() or epoch != self._play_epoch:
                                        break
                                    try:
                                        if next_player.get_state() == vlc.State.Playing:
                                            break
                                    except Exception:
                                        break
                                    time.sleep(0.05)
                                # enforce zero, then unmute before ramp to avoid any initial pop
                                try:
                                    next_player.audio_set_volume(0)
                                except Exception:
                                    pass
                                try:
                                    next_player.audio_set_mute(False)
                                except Exception:
                                    pass

                                # Record that we started this path in this epoch so we won't start it again
                                try:
                                    self._started_next_paths.add(os.path.realpath(next_song))
                                except Exception:
                                    pass

                                # start crossfade progression
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

            # Drive crossfade if active
            if next_started and next_player and fade_start_time is not None:
                fade_elapsed = _now() - fade_start_time
                ratio = min(max(fade_elapsed / crossfade_dur, 0.0), 1.0)
                try:
                    self._player_main.audio_set_volume(int(max(0, min(100, self.current_volume * (1 - ratio)))))
                except Exception:
                    pass
                target_vol = next_volume if next_volume is not None else self.current_volume
                target_vol = max(0, min(100, int(target_vol)))
                try:
                    next_player.audio_set_volume(int(max(0, min(100, target_vol * ratio))))
                except Exception:
                    pass
                if ratio >= 1.0:
                    try:
                        self._player_main.stop()
                    except Exception:
                        pass
                    # swap players: the next player becomes main
                    self._player_main = next_player
                    with self._lock:
                        if self._player_next is next_player:
                            self._player_next = None
                        # clear crossfade guard
                        self._crossfade_active = False
                    # we've consumed the next_index_pending into queue_pos
                    if self._next_index_pending is not None:
                        self.queue_pos = self._next_index_pending
                    self._next_index_pending = None
                    self.now_playing = next_song
                    next_player = None
                    notify_from_player(self.now_playing, target_vol)
            time.sleep(0.05)

        # End of song without crossfade; ensure main is stopped
        try:
            if self._player_main:
                self._player_main.stop()
        except Exception:
            pass
        # cleanup any dangling next player that was never swapped in
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