"""Shim: re-export scenes router from new vibrae_api implementation."""
from apps.api.src.vibrae_api.routes.scenes import router  # type: ignore

__all__ = ["router"]
