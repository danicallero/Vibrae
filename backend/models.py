"""Shim forwarding to core models (vibrae_core.models).

Deprecated: import from `vibrae_core.models` instead of `backend.models`.
Will be removed in a future release.
"""
import warnings as _warnings
_warnings.warn("backend.models is deprecated; use vibrae_core.models", DeprecationWarning, stacklevel=2)
from vibrae_core.models import *  # type: ignore  # noqa: F401,F403
