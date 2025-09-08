import os
from vibrae_core.config import Settings

def test_settings_repo_root_is_directory():
    s = Settings()
    root = s.repo_root()
    assert os.path.isdir(root)


def test_effective_music_base_defaults_to_music(tmp_path, monkeypatch):
    # Force repo_root to tmp
    s = Settings()
    monkeypatch.setattr(s, 'repo_root', lambda: str(tmp_path))
    music_dir = tmp_path / 'music'
    music_dir.mkdir()
    assert s.effective_music_base().endswith('music')


def test_effective_web_dist_fallback(tmp_path, monkeypatch):
    s = Settings()
    monkeypatch.setattr(s, 'repo_root', lambda: str(tmp_path))
    # No web_dist dir yet; create fallback apps/web/dist
    fallback = tmp_path / 'apps' / 'web' / 'dist'
    fallback.mkdir(parents=True)
    assert s.effective_web_dist() == str(fallback)
