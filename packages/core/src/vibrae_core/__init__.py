"""Core domain & services for Vibrae.

Contains scheduling, playback, persistence models, and configuration.
Gradually extracted from legacy `backend` package. Old import paths remain
as shims to avoid breaking existing code/tests during migration.
"""

from .config import Settings  # noqa: F401
