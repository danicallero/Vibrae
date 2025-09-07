"""Shim: re-export users router from new vibrae_api implementation."""
from apps.api.src.vibrae_api.routes.users import router  # type: ignore

__all__ = ["router"]
