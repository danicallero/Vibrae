"""Shim: legacy import path forwarding to core implementation.

Deprecated: import from `vibrae_core.player` instead of `backend.player`.
Will be removed in a future release.
"""
import warnings as _warnings
_warnings.warn("backend.player is deprecated; use vibrae_core.player", DeprecationWarning, stacklevel=2)
from vibrae_core.player import *  # type: ignore  # noqa: F401,F403
import vibrae_core.player as _core_player  # type: ignore

# Bridge for legacy tests that monkeypatch backend.player.notify_from_player
def notify_from_player(song, volume=None):  # noqa: D401
    _core_player._emit_now_playing(song, volume)  # type: ignore[attr-defined]

# Monkeypatch interception: if tests override notify_from_player, also register as listener
def __setattr__(name, value):  # type: ignore
    if name == 'notify_from_player' and callable(value):
        try:
            _core_player.register_player_listener(value)  # type: ignore[attr-defined]
        except Exception:
            pass
    return super().__setattr__(name, value)  # type: ignore[misc]

__all__ = [
    "Player",
    "wait_until",
    "PlaybackStatus",
    "PlayerPhase",
    "register_player_listener",
    "unregister_player_listener",
    "notify_from_player",
]