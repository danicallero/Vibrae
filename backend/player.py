import os
import random
import threading
import time
import subprocess
import platform
import logging
from typing import List, Optional, Tuple
from backend.routes.control import notify_from_player

logger = logging.getLogger("garden_music.player")
logging.basicConfig(
    filename="garden_music.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

class Player:
    def __init__(self, music_base_dir: str):
        self.music_base_dir = music_base_dir
        self.current_folder = None
        self.current_volume = 100
        self.queue: List[str] = []
        self.queue_pos = 0
        self.crossfade_sec = 3

        # Internal state
        self._stop_event = threading.Event()
        self._switch_scene_request: Optional[Tuple[str, Optional[int]]] = None
        self._lock = threading.Lock()
        self._thread = None
        self._player_cmd = self._detect_player()
        self.now_playing: Optional[str] = None
        self._current_proc: Optional[subprocess.Popen] = None
        self._pending_stop = False
        self._pending_stop_deadline = None
        self._stopping = False

    # Utility
    def _detect_player(self) -> str:
        return "afplay" if platform.system().lower() == "darwin" else "mpg123"

    def _load_and_shuffle(self, folder: str):
        folder_path = os.path.join(self.music_base_dir, folder)
        if not os.path.exists(folder_path):
            logger.warning(f"Folder '{folder_path}' does not exist.")
            self.queue = []
            return

        files = [
            os.path.join(folder_path, f)
            for f in os.listdir(folder_path)
            if f.lower().endswith((".mp3", ".wav", ".ogg"))
        ]
        random.shuffle(files)
        self.queue = files
        self.queue_pos = 0
        logger.info(f"Loaded and shuffled {len(files)} files from {folder_path}")

    def _get_song_length(self, song: str) -> float:
        logger.info(f"Getting song length for: {song}")
        try:
            if self._player_cmd == "afplay":
                result = subprocess.run(["afinfo", song], capture_output=True, text=True, timeout=5)
                for line in result.stdout.splitlines():
                    if "estimated duration" in line:
                        return float(line.split()[-2])
            else:
                result = subprocess.run(["mpg123", "--print-length", song], capture_output=True, text=True, timeout=5)
                return float(result.stdout.strip())
        except Exception as e:
            logger.warning(f"Could not determine length for '{song}': {e}")
            return 180.0  # fallback

    # Public
    def set_volume(self, volume: int):
        self.current_volume = volume
        logger.info(f"Setting volume to {volume}")
        try:
            if platform.system().lower() == "darwin":
                subprocess.run(["osascript", "-e", f"set volume output volume {volume}"], check=True)
            else:
                subprocess.run(["amixer", "sset", "Master", f"{volume}%"], check=True)
        except Exception as e:
            logger.warning(f"Failed to set volume: {e}")

    def get_volume(self) -> int:
        return self.current_volume

    def play_scene(self, folder: str, volume: Optional[int] = None):
        with self._lock:
            logger.info(f"play_scene called: folder={folder}, volume={volume}")

            # Ensure no old playback thread exists
            if self._thread and self._thread.is_alive():
                logger.info("[Player] Stopping old thread before starting new scene.")
                self.stop(force=True)

            self.current_folder = folder
            if volume is not None:
                self.set_volume(volume)
            self._load_and_shuffle(folder)
            self._stop_event.clear()
            self._pending_stop = False
            self._pending_stop_deadline = None

            notify_from_player(self.queue[0] if self.queue else None, self.current_volume)

            logger.info("[Player] Starting playback thread.")
            self._thread = threading.Thread(target=self._play_loop, daemon=True)
            self._thread.start()

    def switch_scene(self, folder: str, volume: Optional[int] = None):
        with self._lock:
            logger.info(f"switch_scene requested: folder={folder}, volume={volume}")
            self._switch_scene_request = (folder, volume)

    def stop(self, force: bool = True):
        if self._stopping:
            logger.warning("[Player] Stop already in progress.")
            if force and self._current_proc:
                self._terminate_proc(self._current_proc)
            return

        self._stopping = True
        try:
            logger.info(f"Stopping playback{' (force)' if force else ''}.")
            self._stop_event.set()

            if force and self._current_proc:
                self._terminate_proc(self._current_proc)

            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=5 if force else 310)

                if self._thread.is_alive() and force:
                    logger.error("[Player] Playback thread did not exit in time. Resetting state.")

            self._thread = None
            self._current_proc = None
            self.now_playing = None
            self._pending_stop = False
            self._pending_stop_deadline = None
        finally:
            self._stopping = False

    def stop_after_current_or_timeout(self, timeout_sec=300):
        logger.info(f"[Player] Will stop after current song or {timeout_sec} seconds.")
        self._pending_stop = True
        self._pending_stop_deadline = time.time() + timeout_sec

    def get_now_playing(self) -> Optional[str]:
        return self.now_playing

    # Internal helpers
    def _terminate_proc(self, proc: subprocess.Popen):
        try:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("[Player] Subprocess did not terminate, force-killing.")
                proc.kill()
                proc.wait(timeout=2)
            logger.info("[Player] Subprocess terminated.")
        except Exception as e:
            logger.warning(f"[Player] Failed to terminate subprocess: {e}")

    # Playback loop
    def _play_loop(self):
        while not self._stop_event.is_set():
            with self._lock:
                if self._switch_scene_request:
                    folder, volume = self._switch_scene_request
                    logger.info(f"[Player] Switching to new scene immediately: {folder}")
                    self._switch_scene_request = None
                    self.current_folder = folder
                    if volume is not None:
                        self.set_volume(volume)
                    self._load_and_shuffle(folder)
                    self.queue_pos = 0

            if not self.queue:
                logger.info(f"[Player] No playable files in '{self.current_folder}'. Waiting...")
                time.sleep(5)
                continue

            try:
                song = self.queue[self.queue_pos]
            except IndexError:
                logger.error("[Player] Queue index out of range. Resetting queue.")
                self.queue_pos = 0
                continue

            next_pos = (self.queue_pos + 1) % len(self.queue)
            next_song = self.queue[next_pos] if next_pos != self.queue_pos else None

            self.now_playing = song
            notify_from_player(song, self.current_volume)
            self._play_song_with_crossfade(song, next_song)

            if self._stop_event.is_set() and not self._pending_stop:
                logger.info("[Player] Stop event detected. Exiting play loop.")
                break

            self.queue_pos = next_pos
            if self.queue_pos == 0:
                logger.info("[Player] Queue finished, reshuffling.")
                random.shuffle(self.queue)

    def _play_song_with_crossfade(self, song: str, next_song: Optional[str]):
        logger.info(f"[Player] _play_song_with_crossfade: song={song}, next_song={next_song}")
        song_length = self._get_song_length(song)
        play_time = max(0, song_length - self.crossfade_sec) if next_song else song_length

        try:
            proc = subprocess.Popen(
                ["afplay", song] if self._player_cmd == "afplay" else ["mpg123", "-q", song]
            )
            self._current_proc = proc
            start = time.time()

            while time.time() - start < play_time:
                if self._stop_event.is_set():  # Immediate break on force stop
                    proc.terminate()
                    return

                if self._pending_stop and self._pending_stop_deadline and time.time() >= self._pending_stop_deadline:
                    logger.info("[Player] Timeout reached, stopping song.")
                    proc.terminate()
                    self._stop_event.set()
                    return

                time.sleep(0.2)

            if self._pending_stop:
                logger.info("[Player] Current song finished, pending stop active. Not starting next song.")
                proc.wait()
                notify_from_player(None, self.current_volume)
                self._stop_event.set()
                return

            if next_song:
                next_proc = subprocess.Popen(
                    ["afplay", next_song] if self._player_cmd == "afplay" else ["mpg123", "-q", next_song]
                )
                time.sleep(self.crossfade_sec)
                proc.terminate()
                next_proc.wait()
            else:
                proc.wait()

        except Exception as e:
            logger.error(f"[Player] Error during playback: {e}")

        finally:
            self._current_proc = None
            if self._pending_stop:
                logger.info("[Player] Song finished, pending stop active. Signaling stop now.")
                notify_from_player(None, self.current_volume)
                self._stop_event.set()
