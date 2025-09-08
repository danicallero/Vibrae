from fastapi import APIRouter, Depends, HTTPException, Header, Response
import logging
from fastapi.responses import FileResponse
from typing import Optional, List, Dict
from pathlib import Path
import os
import re
from vibrae_core.auth import get_current_user, decode_token

router = APIRouter(prefix="/logs", tags=["logs"])
log = logging.getLogger("vibrae_api")

_unused = decode_token

def token_from_header_or_query(Authorization: Optional[str] = Header(None), token: Optional[str] = None):
    # Kept for backward-compat dependency signature but no longer used by routes.
    if token:
        return decode_token(token)
    if Authorization and Authorization.startswith("Bearer "):
        return decode_token(Authorization[len("Bearer "):])
    raise HTTPException(status_code=401, detail="Missing or invalid token")

REPO_ROOT = Path(__file__).resolve().parents[5]
LOGS_DIR = REPO_ROOT / "logs"
HISTORY_DIR = LOGS_DIR / "history"

ALLOWED_BASENAMES = {"backend.log", "player.log", "websocket.log", "auth.log", "serve.log", "cloudflared.log"}
HISTORY_PREFIXES = {name.replace(".log", "") for name in ALLOWED_BASENAMES}
HISTORY_REGEX = re.compile(r"^(backend|player|websocket|auth|serve|cloudflared)-(\d{8})-(\d{6})\.log$")

def _file_info(p: Path) -> Dict:
    try:
        stat = p.stat()
        return {"name": p.name, "size": stat.st_size, "mtime": int(stat.st_mtime)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

@router.get("/")
def list_logs(user = Depends(get_current_user)):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    current: List[Dict] = []
    for base in sorted(ALLOWED_BASENAMES):
        p = LOGS_DIR / base
        if p.exists() and p.is_file():
            current.append(_file_info(p))
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
def list_log_history(base: str, user = Depends(get_current_user)):
    base_norm = base[:-4] if base.endswith(".log") else base
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
    if "/" in file or ".." in file or file.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid file name")
    if history:
        if not HISTORY_REGEX.match(file):
            raise HTTPException(status_code=400, detail="Not an allowed history file name")
        path = HISTORY_DIR / file
    else:
        if file not in ALLOWED_BASENAMES:
            raise HTTPException(status_code=400, detail="Not an allowed log file")
        path = LOGS_DIR / file
    try:
        path.resolve().relative_to(HISTORY_DIR if history else LOGS_DIR)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return path

def _tail_file(path: Path, lines: int) -> str:
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
            data[:0] = chunk
            newline_count = data.count(b"\n")
            if file_size - offset == 0:
                break
    text = data.decode("utf-8", errors="replace")
    parts = text.splitlines()
    return "\n".join(parts[-lines:])

@router.get("/content")
def get_log_content(file: str, tail: int = 200, history: bool = False, user = Depends(get_current_user)):
    path = _resolve_log_path(file, history)
    try:
        content = _tail_file(path, tail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    log.info("logs.content file=%s history=%s tail=%d actor=%s", path.name, history, tail, getattr(user, "username", "?"))
    return Response(content, media_type="text/plain; charset=utf-8")

@router.get("/download")
def download_log(file: str, history: bool = False, user = Depends(get_current_user)):
    path = _resolve_log_path(file, history)
    headers = {"Content-Disposition": f"attachment; filename={path.name}"}
    log.info("logs.download file=%s history=%s actor=%s", path.name, history, getattr(user, "username", "?"))
    return FileResponse(str(path), media_type="text/plain; charset=utf-8", headers=headers)
