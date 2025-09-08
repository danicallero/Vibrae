import sys, types, time, pytest, os, tempfile

# Always force tests to use an isolated SQLite database file under a temp dir.
# Do this before importing any vibrae_core modules (especially vibrae_core.db).
if "VIBRAE_DB_URL" not in os.environ and "VIBRAE_DATABASE_URL" not in os.environ:
    _test_db_dir = tempfile.mkdtemp(prefix="vibrae_test_db_")
    os.environ["VIBRAE_DB_URL"] = f"sqlite:///{os.path.join(_test_db_dir, 'test_garden.db')}"
# Ensure repository root and core src are on sys.path for imports
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
CORE_SRC = os.path.join(ROOT, 'packages', 'core', 'src')
if CORE_SRC not in sys.path:
    sys.path.insert(0, CORE_SRC)

# Note: sys.path setup remains after env override.

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
    # Import vibrae_core.player directly (legacy backend removed)
    import importlib, vibrae_core.player as core_player
    importlib.reload(core_player)
    return core_player
