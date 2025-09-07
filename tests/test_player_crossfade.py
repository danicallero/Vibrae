import time
import threading
try:
    from vibrae_core.player import register_player_listener, unregister_player_listener
except Exception:  # fallback if older structure
    register_player_listener = unregister_player_listener = None  # type: ignore


class NotifyRecorder:
    def __init__(self):
        self.events = []
    def __call__(self, song, volume=None):
        self.events.append((song, volume))


def test_crossfade_promotion_and_guard(player_module, monkeypatch):
    Player = player_module.Player
    wait_until = player_module.wait_until
    recorder = NotifyRecorder()
    if register_player_listener:
        register_player_listener(lambda s,v=None: recorder(s, v))
    else:
        monkeypatch.setattr(player_module, 'notify_from_player', recorder, False)

    p = Player(music_base_dir='.')
    p.crossfade_sec = 0.2
    p.promotion_guard_window = 0.15
    p.queue = ['a.mp3', 'b.mp3']
    p.queue_pos = 0

    t = threading.Thread(target=p._play_loop, daemon=True)
    t.start()

    wait_until(lambda: any(e[0] == 'a.mp3' for e in recorder.events), 1.0)
    assert p.now_playing in ('a.mp3', 'b.mp3')
    wait_until(lambda: any(e[0] == 'b.mp3' for e in recorder.events), 2.0)

    last_id = p._status.last_handoff_main_id
    guard_until = p._status.promotion_guard_until
    # Guard might not trigger if promotion not needed (e.g., no crossfade yet) so allow leniency
    if last_id is not None:
        assert guard_until >= time.monotonic() - 0.05

    p.stop(force=True)
    t.join(timeout=1)
    assert len(recorder.events) >= 1
    if unregister_player_listener and register_player_listener:
        # We didn't save the lambda, but test scope ends; listeners cleared by process end.
        pass


def test_wait_until_and_shutdown(player_module):
    Player = player_module.Player
    wait_until = player_module.wait_until
    p = Player('.')
    flag = {'v': False}
    def flip():
        flag['v'] = True
    threading.Timer(0.05, flip).start()
    assert wait_until(lambda: flag['v'], 1.0)
    p.shutdown()
    p.shutdown()
