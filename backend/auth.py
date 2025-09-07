"""Shim forwarding to core auth (vibrae_core.auth).

Deprecated: import from `vibrae_core.auth` instead of `backend.auth`.
Will be removed in a future release.
"""
import warnings as _warnings
_warnings.warn("backend.auth is deprecated; use vibrae_core.auth", DeprecationWarning, stacklevel=2)
from vibrae_core.auth import *  # type: ignore  # noqa: F401,F403

