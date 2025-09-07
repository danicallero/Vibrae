"""Shim: re-export schedule router from new vibrae_api implementation."""
from apps.api.src.vibrae_api.routes.schedule import router  # type: ignore

__all__ = ["router"]
