"""
config.py
Centralized settings and helpers for Vibrae runtime configuration.
Reads from environment, with sensible defaults, and provides USB detection.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from typing import Optional, List


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
    """Build mount path candidates for a given volume or label name across OSes."""
    c: List[str] = []
    if _is_macos():
        c.append(os.path.join("/Volumes", name))
    if _is_linux():
        # Common Linux/Pi layouts
        # /media/<user>/<name>
        for user_dir in _list_dirs("/media"):
            c.append(os.path.join(user_dir, name))
        # /mnt/<name>
        c.append(os.path.join("/mnt", name))
    return c


def find_usb_music_root(extensions: tuple = (".mp3", ".wav", ".ogg"), preferred_name: Optional[str] = None) -> Optional[str]:
    """Find a likely USB mount containing music files.
    - macOS: scans /Volumes/*
    - Linux (incl. Raspberry Pi): scans /media/*/* and /mnt/*
    Returns the mount path if found, else None.
    """
    # If a preferred volume/label name is provided, try that first.
    if preferred_name:
        # If value looks like an absolute path, use it directly if exists
        if os.path.isabs(preferred_name) and os.path.isdir(preferred_name):
            return preferred_name
        # Otherwise, try common mount points for that name
        for p in _candidate_mount_paths_for_name(preferred_name):
            if os.path.isdir(p):
                return p

    candidates: List[str] = []
    if _is_macos():
        candidates.extend(_list_dirs("/Volumes"))
    if _is_linux():
        # Common Raspberry Pi / Debian mount points
        for root in ("/media", "/mnt"):
            for user_dir in _list_dirs(root):
                candidates.extend(_list_dirs(user_dir)) if root == "/media" else candidates.append(user_dir)

    # Heuristic: pick a candidate that contains at least one audio file within a shallow scan
    for mount in candidates:
        try:
            for dirpath, _dirnames, filenames in os.walk(mount):
                # limit depth to 2 to keep it fast
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
    # Music source selection
    music_mode: str = _env("MUSIC_MODE", "folder")  # "folder" | "usb"
    # If folder mode, path to base music directory (absolute or relative to repo root)
    music_dir: str = _env("MUSIC_DIR", "music")
    # Optional subfolder to constrain within the USB root (e.g., "navidad")
    usb_subdir: Optional[str] = _env("USB_SUBDIR", None)
    # Specific USB volume/label or absolute path to mount; overrides auto-scan when set
    usb_name: Optional[str] = _env("VIBRAE_MUSIC", None)

    # Frontend static export directory (absolute or repo-relative)
    web_dist: str = _env("WEB_DIST", "front/dist")

    # Tunnel settings
    tunnel: str = _env("TUNNEL", "cloudflared")  # "cloudflared" | "none"
    cloudflare_token: Optional[str] = _env("CLOUDFLARE_TUNNEL_TOKEN", None)

    # Resolve absolute paths based on repository root (two levels up from this file)
    def _bundle_base(self) -> Optional[str]:
        # PyInstaller one-dir/one-file extraction dir
        base = getattr(sys, "_MEIPASS", None)
        if base and os.path.isdir(base):
            return base
        return None

    def repo_root(self) -> str:
        # Prefer PyInstaller bundle base if present, else repository root relative to this file
        base = self._bundle_base()
        if base:
            return base
        return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

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
            # fallback to configured folder
        return self.resolve_path(self.music_dir) or os.path.join(self.repo_root(), "music")

    def effective_web_dist(self) -> Optional[str]:
        # Try configured path
        path = self.resolve_path(self.web_dist)
        if path and os.path.isdir(path):
            return path
        # Try common fallback location inside bundle/repo
        for rel in ("front/dist", "dist", "web", "public"):
            p = self.resolve_path(rel)
            if p and os.path.isdir(p):
                return p
        return None
