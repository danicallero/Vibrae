"""Shim forwarding to core scheduler (vibrae_core.scheduler).

Deprecated: import from `vibrae_core.scheduler` instead of `backend.scheduler`.
Will be removed in a future release.
"""
import warnings as _warnings
_warnings.warn("backend.scheduler is deprecated; use vibrae_core.scheduler", DeprecationWarning, stacklevel=2)
from vibrae_core.scheduler import *  # type: ignore  # noqa: F401,F403
