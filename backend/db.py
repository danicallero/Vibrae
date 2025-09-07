"""Shim forwarding to core implementation (vibrae_core.db).

Deprecated: import from `vibrae_core.db` instead of `backend.db`.
Will be removed in a future release.
"""
import warnings as _warnings
_warnings.warn("backend.db is deprecated; use vibrae_core.db", DeprecationWarning, stacklevel=2)
from vibrae_core.db import *  # type: ignore  # noqa: F401,F403

