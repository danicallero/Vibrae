"""Configuration utilities (extracted from legacy backend.config)."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List
import os, sys

# ---- Helpers (mostly verbatim copy; minor renames allowed) ----

def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.getenv(name)
    return val if val not in (None, "") else default


def _is_macos() -> bool:
    return sys.platform == "darwin"


def _is_linux() -> bool:
    return sys.platform.startswith("linux")


def _list_dirs(path: str) -> List[str]:
    try:
        return [os.path.join(path, d) for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
    except Exception:
        return []


def _candidate_mount_paths_for_name(name: str) -> List[str]:
    c: List[str] = []
    if _is_macos():
        c.append(os.path.join("/Volumes", name))
    if _is_linux():
        for user_dir in _list_dirs("/media"):
            c.append(os.path.join(user_dir, name))
        c.append(os.path.join("/mnt", name))
    return c


def find_usb_music_root(extensions: tuple = (".mp3", ".wav", ".ogg"), preferred_name: Optional[str] = None) -> Optional[str]:
    if preferred_name:
        if os.path.isabs(preferred_name) and os.path.isdir(preferred_name):
            return preferred_name
        for p in _candidate_mount_paths_for_name(preferred_name):
            if os.path.isdir(p):
                return p
    candidates: List[str] = []
    if _is_macos():
        candidates.extend(_list_dirs("/Volumes"))
    if _is_linux():
        for root in ("/media", "/mnt"):
            for user_dir in _list_dirs(root):
                candidates.extend(_list_dirs(user_dir)) if root == "/media" else candidates.append(user_dir)
    for mount in candidates:
        try:
            for dirpath, _dirnames, filenames in os.walk(mount):
                rel = os.path.relpath(dirpath, mount)
                if rel.count(os.sep) > 2:
                    continue
                for f in filenames:
                    if f.lower().endswith(extensions):
                        return mount
        except Exception:
            continue
    return None


@dataclass
class Settings:
    music_mode: str = _env("MUSIC_MODE", "folder")
    music_dir: str = _env("MUSIC_DIR", "music")
    usb_subdir: Optional[str] = _env("USB_SUBDIR", None)
    usb_name: Optional[str] = _env("VIBRAE_MUSIC", None)
    # Static web (Expo export) distribution directory. Historically referenced as
    # 'front/dist' before the frontend was relocated under apps/web. Default now
    # points to the new path. WEB_DIST retained for backwards compatibility; prefer
    # FRONTEND_DIST externally if both exist.
    web_dist: str = _env("WEB_DIST", "apps/web/dist")
    tunnel: str = _env("TUNNEL", "cloudflared")
    cloudflare_token: Optional[str] = _env("CLOUDFLARE_TUNNEL_TOKEN", None)

    def _bundle_base(self) -> Optional[str]:
        base = getattr(sys, "_MEIPASS", None)
        if base and os.path.isdir(base):
            return base
        return None

    def repo_root(self) -> str:
        base = self._bundle_base()
        if base:
            return base
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))

    def resolve_path(self, p: Optional[str]) -> Optional[str]:
        if not p:
            return None
        if os.path.isabs(p):
            return p
        return os.path.abspath(os.path.join(self.repo_root(), p))

    def effective_music_base(self) -> str:
        if self.music_mode == "usb":
            mount = find_usb_music_root(preferred_name=self.usb_name)
            if mount:
                base = os.path.join(mount, self.usb_subdir) if self.usb_subdir else mount
                return base
        return self.resolve_path(self.music_dir) or os.path.join(self.repo_root(), "music")

    def effective_web_dist(self) -> Optional[str]:
        path = self.resolve_path(self.web_dist)
        if path and os.path.isdir(path):
            return path
        # Fallback heuristic search (relative to repo root) for historical layouts
        for rel in ("apps/web/dist", "dist", "web", "public"):
            p = self.resolve_path(rel)
            if p and os.path.isdir(p):
                return p
        return None
