import threading
import time


def test_stop_after_current_prevents_next(player_module):
    Player = player_module.Player
    wait_until = player_module.wait_until

    p = Player(music_base_dir='.')
    # Short crossfade and quick lengths via mocked VLC in conftest.py
    p.crossfade_sec = 0.1
    p.queue = ['a.mp3', 'b.mp3']
    p.queue_pos = 0

    t = threading.Thread(target=p._play_loop, daemon=True)
    t.start()

    # Wait until first song starts
    assert wait_until(lambda: p.get_now_playing() == 'a.mp3', 1.0)

    # Request stop-after-current; player must not start 'b.mp3'
    p.stop_after_current_or_timeout(timeout_sec=5)

    # Ensure that 'b.mp3' never becomes now_playing
    time.sleep(0.3)
    assert p.get_now_playing() == 'a.mp3'

    # Eventually the loop should exit after song end
    assert wait_until(lambda: not p.is_playing(), 3.0)
    t.join(timeout=1)
