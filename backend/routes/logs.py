from fastapi import APIRouter, Depends, HTTPException, Header, Response
from fastapi.responses import FileResponse
from typing import Optional, List, Dict
from pathlib import Path
import os
import time
import re

from backend.auth import decode_token


router = APIRouter(prefix="/logs", tags=["logs"])


# Auth
def token_from_header(Authorization: Optional[str] = Header(None)):
    if not Authorization or not Authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return decode_token(Authorization[len("Bearer "):])


def token_from_header_or_query(
    Authorization: Optional[str] = Header(None),
    token: Optional[str] = None,
):
    # Accept either Bearer header or token query param
    if token:
        return decode_token(token)
    if Authorization and Authorization.startswith("Bearer "):
        return decode_token(Authorization[len("Bearer "):])
    raise HTTPException(status_code=401, detail="Missing or invalid token")


# Base paths
REPO_ROOT = Path(__file__).resolve().parents[2]
LOGS_DIR = REPO_ROOT / "logs"
HISTORY_DIR = LOGS_DIR / "history"

# Exposed auth families
ALLOWED_BASENAMES = {
    "backend.log",
    "player.log",
    "serve.log",
    "cloudflared.log",
}
HISTORY_PREFIXES = {name.replace(".log", "") for name in ALLOWED_BASENAMES}
HISTORY_REGEX = re.compile(r"^(backend|player|serve|cloudflared)-(\d{8})-(\d{6})\.log$")


def _file_info(p: Path) -> Dict:
    try:
        stat = p.stat()
        return {
            "name": p.name,
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@router.get("/")
def list_logs(token: dict = Depends(token_from_header)):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    current: List[Dict] = []
    for base in sorted(ALLOWED_BASENAMES):
        p = LOGS_DIR / base
        if p.exists() and p.is_file():
            current.append(_file_info(p))

    # Provide a flat history list for compatibility (all logs), though a per-log endpoint exists
    history: List[Dict] = []
    if HISTORY_DIR.exists():
        for p in HISTORY_DIR.iterdir():
            if not p.is_file():
                continue
            if HISTORY_REGEX.match(p.name):
                history.append(_file_info(p))
    history.sort(key=lambda x: x["mtime"], reverse=True)

    return {"current": current, "history": history}


@router.get("/history")
def list_log_history(base: str, token: dict = Depends(token_from_header)):
    # Normalize base: accept with or without .log
    base_norm = base
    if base_norm.endswith(".log"):
        base_norm = base_norm[:-4]
    if base_norm not in HISTORY_PREFIXES:
        raise HTTPException(status_code=400, detail="Not an allowed log base")

    files: List[Dict] = []
    if HISTORY_DIR.exists():
        for p in HISTORY_DIR.iterdir():
            if not p.is_file():
                continue
            m = HISTORY_REGEX.match(p.name)
            if not m:
                continue
            if m.group(1) == base_norm:
                files.append(_file_info(p))
    files.sort(key=lambda x: x["mtime"], reverse=True)
    return {"base": f"{base_norm}.log", "history": files}


def _resolve_log_path(file: str, history: bool) -> Path:
    # Prevent path traversal
    if "/" in file or ".." in file or file.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid file name")

    if history:
        # Must match allowed hyphenated pattern like backend-YYYYMMDD-HHMMSS.log
        if not HISTORY_REGEX.match(file):
            raise HTTPException(status_code=400, detail="Not an allowed history file name")
        path = HISTORY_DIR / file
    else:
        if file not in ALLOWED_BASENAMES:
            raise HTTPException(status_code=400, detail="Not an allowed log file")
        path = LOGS_DIR / file

    # Ensure path within expected dir
    try:
        path.resolve().relative_to(HISTORY_DIR if history else LOGS_DIR)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return path


def _tail_file(path: Path, lines: int) -> str:
    # Efficient-ish tail for text files; decode utf-8 with replacement
    if lines <= 0:
        return ""
    block_size = 8192
    data = bytearray()
    newline_count = 0
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        file_size = f.tell()
        offset = 0
        while offset < file_size and newline_count <= lines:
            read_size = min(block_size, file_size - offset)
            offset += read_size
            f.seek(file_size - offset)
            chunk = f.read(read_size)
            data[:0] = chunk  # prepend
            newline_count = data.count(b"\n")
            if file_size - offset == 0:
                break
    # Split and take last N lines
    text = data.decode("utf-8", errors="replace")
    parts = text.splitlines()
    return "\n".join(parts[-lines:])


@router.get("/content")
def get_log_content(
    file: str,
    tail: int = 200,
    history: bool = False,
    token: dict = Depends(token_from_header),
):
    path = _resolve_log_path(file, history)
    try:
        content = _tail_file(path, tail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Return as plain text to ease rendering
    return Response(content, media_type="text/plain; charset=utf-8")


@router.get("/download")
def download_log(
    file: str,
    history: bool = False,
    token: Optional[str] = None,
    _=Depends(token_from_header_or_query),
):
    path = _resolve_log_path(file, history)
    # Force a safe plain-text download
    headers = {"Content-Disposition": f"attachment; filename={path.name}"}
    return FileResponse(str(path), media_type="text/plain; charset=utf-8", headers=headers)
