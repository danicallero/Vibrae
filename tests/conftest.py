import sys, types, time, pytest

# Reusable VLC shim for tests
class MockState:
    Playing = 'Playing'
    Ended = 'Ended'
    Stopped = 'Stopped'
    Error = 'Error'

class MockMedia:
    def __init__(self, path: str):
        self._path = path
    def parse(self):
        return None
    def get_duration(self):
        return 1500  # 1.5s length to trigger quick crossfades

class MockInstance:
    def media_new(self, path: str):
        return MockMedia(path)
    def release(self):
        pass

class MockMediaPlayer:
    def __init__(self, path: str):
        self.path = path
        self._volume = 0
        self._mute = False
        self._stopped = False
        self._start = time.monotonic()
    def audio_set_mute(self, mute: bool):
        self._mute = mute
    def audio_set_volume(self, v: int):
        self._volume = v
    def get_state(self):
        return MockState.Stopped if self._stopped else MockState.Playing
    def get_time(self):
        return int((time.monotonic() - self._start) * 1000)
    def stop(self):
        self._stopped = True
    def release(self):
        pass

@pytest.fixture(autouse=True)
def mock_vlc(monkeypatch):
    mod = types.ModuleType('vlc')
    mod.Instance = lambda: MockInstance()
    mod.MediaPlayer = MockMediaPlayer
    mod.State = types.SimpleNamespace(Ended=MockState.Ended, Stopped=MockState.Stopped, Error=MockState.Error)
    mod.MediaParseFlag = types.SimpleNamespace(local=1)
    sys.modules['vlc'] = mod
    yield
    # cleanup not strictly needed; test session ends

@pytest.fixture
def player_module(mock_vlc):
    # Reload backend.player after mocking vlc
    import importlib, backend.player
    importlib.reload(backend.player)
    return backend.player
