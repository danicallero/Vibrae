"""Shim: re-export control router from new vibrae_api implementation."""
from apps.api.src.vibrae_api.routes.control import router  # type: ignore

__all__ = ["router"]
