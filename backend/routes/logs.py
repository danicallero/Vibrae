"""Shim: re-export logs router from new vibrae_api implementation."""
from apps.api.src.vibrae_api.routes.logs import router  # type: ignore

__all__ = ["router"]
