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

class Player:
    def __init__(self, music_base_dir: str):
        self.music_base_dir = music_base_dir
        self.current_folder: Optional[str] = None
        self.current_volume = 100
        self.queue: List[str] = []
        self.queue_pos = 0
        self.crossfade_sec = 5

        self._stop_event = threading.Event()
        self._switch_scene_request: Optional[Tuple[str, Optional[int]]] = None
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None

        # VLC players
        self._vlc_instance = vlc.Instance()
        self._player_main: Optional[vlc.MediaPlayer] = None
        self._player_next: Optional[vlc.MediaPlayer] = None
        self.now_playing: Optional[str] = None

        # Stop control
        self._pending_stop = False
        self._pending_stop_deadline: Optional[float] = None
        self._stop_after_song = False  # soft stop
        self._stopping = False

    # Utilities
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
        try:
            media = self._vlc_instance.media_new(song)
            # parse media
            media.parse_with_options(vlc.MediaParseFlag.local, timeout=5)
            length = media.get_duration() / 1000  # seconds
            logger.info(f"Length of '{song}': {length} seconds")
            return length if length and length > 0 else 180.0
        except Exception as e:
            logger.warning(f"Could not get length for '{song}': {e}")
            return 180.0

    # Public
    def set_volume(self, volume: int):
        new_volume = max(0, min(volume, 100))
        self.current_volume = new_volume

        try:
            if self._player_main:
                self._player_main.audio_set_volume(new_volume)
        except Exception as e:
            logger.warning(f"Error setting volume: {e}")
            pass
        try:
            if self._player_next:
                self._player_next.audio_set_volume(new_volume)
        except Exception as e:
            logger.warning(f"Error setting volume: {e}")
            pass

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
            self._switch_scene_request = (folder, volume)

    def stop(self, force: bool = True):
        def _reset():
            for p in (self._player_main, self._player_next):
                try: p and p.stop()
                except Exception as e: logger.warning(f"Error stopping player: {e}")
            self._player_main = self._player_next = None
            self.now_playing = None
            self._pending_stop = self._stop_after_song = False
            self._pending_stop_deadline = None
            self._stop_event.clear()
            notify_from_player(None)
        
        if self._stopping and force:
            _reset()
            self._stopping = False
            return

        self._stopping = True
        try:
            self._stop_event.set()
            if force:
                _reset()
            if self._thread and self._thread.is_alive():
                self._thread.join(timeout=5 if force else 310)  # Wait for the thread to finish
            _reset()
        finally:
            self._stopping = False

    def stop_after_current_or_timeout(self, timeout_sec=300):
        """Pide parar al acabar la canción en curso o al llegar al timeout."""
        self._pending_stop = True
        self._stop_after_song = True
        self._pending_stop_deadline = time.time() + max(0, timeout_sec)

    def get_now_playing(self) -> Optional[str]:
        return self.now_playing

    def is_playing(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and self.now_playing)

    # Playback loop (non-blocking)
    def _play_loop(self):
        idle_since: Optional[float] = None  # track long-empty-queue to exit gracefully
        try:
            while not self._stop_event.is_set():
                # Si hay deadline y ya venció, salir sin empezar nada nuevo
                if self._pending_stop and self._pending_stop_deadline and time.time() >= self._pending_stop_deadline:
                    logger.info("Pending stop deadline reached before next song — exiting loop.")
                    break

                # Handle scene switch at the top of the loop
                with self._lock:
                    if self._switch_scene_request:
                        folder, volume = self._switch_scene_request
                        self._switch_scene_request = None
                        self.current_folder = folder
                        if volume is not None:
                            self.set_volume(volume)
                        self._load_and_shuffle(folder)
                        self.queue_pos = 0

                if not self.queue:
                    if idle_since is None:
                        idle_since = time.time()
                    elif time.time() - idle_since > 10:
                        logger.info("Queue has been empty for >10s — exiting loop.")
                        break
                    time.sleep(0.2)
                    continue
                else:
                    idle_since = None

                # Si hay intención de parar al terminar la canción previa, no arranques otra
                if self._pending_stop and self._stop_after_song and not self.now_playing:
                    logger.info("Stop-after-song requested and previous song finished — exiting loop.")
                    break

                # Get current song
                song = self.queue[self.queue_pos]

                # Compute next song index (will be recalculated in crossfade if scene changes)
                if len(self.queue) > 1:
                    next_index = (self.queue_pos + 1) % len(self.queue)
                    next_song = self.queue[next_index] if next_index != self.queue_pos else None
                else:
                    next_song = None

                self.now_playing = song
                notify_from_player(song, self.current_volume)

                # Play current song with crossfade support
                self._play_song_non_blocking(song, next_song)

                # Si durante la canción nos han pedido parar, no avances la cola
                if self._pending_stop:
                    logger.info("Pending stop active after song finished — exiting loop.")
                    break

                # Move queue forward
                with self._lock:
                    if self.queue:
                        self.queue_pos = (self.queue_pos + 1) % len(self.queue)
                        if self.queue_pos == 0 and len(self.queue) > 1:
                            random.shuffle(self.queue)
        finally:
            # Loop exit cleanup
            try:
                notify_from_player(None)
                # Fade out players
                try:
                    if self._player_main and self._player_main.is_playing():
                        self._fade_out_and_stop(self._player_main)
                except Exception as e:
                    logger.warning(f"Error during fade out of main player: {e}")
                    pass
                try:
                    if self._player_next and self._player_next.is_playing():
                        self._fade_out_and_stop(self._player_next)
                except Exception as e:
                    logger.warning(f"Error during fade out of next player: {e}")
                    pass
            except Exception:
                pass  # Ignore ws errors

            self._player_main = None
            self._player_next = None
            self.now_playing = None

    def _fade_out_and_stop(self, player: vlc.MediaPlayer, fade_sec: int = 2):
        """Fade out player in a separate thread and stop it safely."""
        if not player:
            return

        def fade_thread():
            try:
                # Clamp fade time
                fade_sec = max(0.1, float(fade_sec))
                steps = 20
                try:
                    current_vol = max(player.audio_get_volume(), 0)
                except Exception as e:
                    current_vol = 0
                    logger.warning(f"Error getting current volume: {e}. Defaulting to 0.")
                for i in range(steps):
                    if self._stop_event.is_set():  # immediate stop
                        break
                    try:
                        state = player.get_state()
                        if state in (vlc.State.Ended, vlc.State.Stopped, vlc.State.Error):
                            break
                    except Exception:
                        break  # ignore errors during fade
                    vol = int(max(0, min(100, current_vol * (1 - i / steps))))
                    try:
                        player.audio_set_volume(vol)
                    except Exception:
                        pass
                    time.sleep(fade_sec / steps)
                try:
                    player.stop()
                except Exception as e:
                    logger.warning(f"Error stopping player: {e}")
                    pass
            except Exception as e:
                logger.warning(f"Error during fade_out: {e}")

        threading.Thread(target=fade_thread, daemon=True).start()

    def _play_song_non_blocking(self, song: str, next_song: Optional[str], next_volume: Optional[int] = None):
        """Play a song with optional crossfade to next_song."""
        self._player_main = vlc.MediaPlayer(song)
        self._player_main.audio_set_volume(0)
        self._player_main.play()

        # Wait until VLC is actually playing
        t0 = time.time()
        while self._player_main.get_state() != vlc.State.Playing and time.time() - t0 < 2:
            time.sleep(0.05)

        # Fade-in main player
        for i in range(20):
            vol = int(self.current_volume * (i + 1) / 20)
            self._player_main.audio_set_volume(vol)
            time.sleep(0.05)

        song_length = self._get_song_length(song)
        fade_start = song_length - self.crossfade_sec if next_song else song_length
        start_time = time.time()
        next_started = False
        next_player: Optional[vlc.MediaPlayer] = None
        fade_start_time = None

        while self._player_main.is_playing():
            elapsed = time.time() - start_time

            # Stop immediately if global stop requested
            if self._stop_event.is_set():
                self._fade_out_and_stop(self._player_main)
                if next_player:
                    self._fade_out_and_stop(next_player)
                return

            # stop after current timeout / after-song logic
            if self._pending_stop:
                # Timeout check
                if self._pending_stop_deadline and time.time() >= self._pending_stop_deadline:
                    logger.info("Pending stop deadline reached — stopping immediately.")
                    self._fade_out_and_stop(self._player_main)
                    if next_player:
                        self._fade_out_and_stop(next_player)
                    return

                # Si no hay crossfade previsto, para al terminar la canción
                if not next_song and elapsed >= song_length - 0.5:
                    logger.info("Song finished and pending stop requested — stopping now.")
                    self._fade_out_and_stop(self._player_main)
                    return

                # Justo antes de iniciar el crossfade, no arranques la siguiente; para con fade
                if not next_started and elapsed >= fade_start:
                    logger.info("Pending stop active — ending after current song instead of crossfading.")
                    self._fade_out_and_stop(self._player_main)
                    return

            # Start crossfade (only if no pending stop)
            if not next_started and elapsed >= fade_start:
                if self._pending_stop:
                    # Seguridad adicional; debería haber salido arriba
                    logger.info("Pending stop active at crossfade gate — stopping current.")
                    self._fade_out_and_stop(self._player_main)
                    return

                # recompute next song in case scene switched
                with self._lock:
                    if self._switch_scene_request:
                        folder, volume = self._switch_scene_request
                        self._switch_scene_request = None
                        self.current_folder = folder
                        if volume is not None:
                            self.set_volume(volume)
                        self._load_and_shuffle(folder)
                        self.queue_pos = 0

                    next_index = (self.queue_pos + 1) % len(self.queue)
                    next_song = self.queue[next_index] if next_index != self.queue_pos else None

                if next_song:
                    next_player = vlc.MediaPlayer(next_song)
                    target_vol = next_volume if next_volume is not None else self.current_volume
                    next_player.audio_set_volume(0)
                    next_player.play()
                    # wait until actually playing
                    t1 = time.time()
                    while next_player.get_state() != vlc.State.Playing and time.time() - t1 < 2:
                        time.sleep(0.05)
                    next_started = True
                    fade_start_time = time.time()

            # Crossfade logic
            if next_started and next_player and fade_start_time is not None:
                fade_elapsed = time.time() - fade_start_time
                ratio = min(fade_elapsed / self.crossfade_sec, 1.0)
                self._player_main.audio_set_volume(int(self.current_volume * (1 - ratio)))
                target_vol = next_volume if next_volume is not None else self.current_volume
                next_player.audio_set_volume(int(target_vol * ratio))
                if ratio >= 1.0:
                    self._player_main.stop()
                    self._player_main = next_player
                    self.now_playing = next_song
                    next_player = None
                    notify_from_player(self.now_playing, target_vol)

            time.sleep(0.05)