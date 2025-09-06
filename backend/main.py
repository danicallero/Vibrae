# main.py
# SPDX-License-Identifier: GPL-3.0-or-later

import os, asyncio, socket, urllib.request
from fastapi import FastAPI
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import users, scenes, schedule, control, logs
from backend.player import Player
from backend.scheduler import Scheduler
from backend.config import Settings
from dotenv import load_dotenv

# Docs disabled by default; ENABLE_API_DOCS=1 to expose under /api
if os.getenv("ENABLE_API_DOCS") == "1":
    app = FastAPI(docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
else:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
settings = Settings()
MUSIC_DIR = settings.effective_music_base()
player = Player(MUSIC_DIR)
scheduler = Scheduler(player)

web_dist = settings.effective_web_dist()

@app.on_event("startup")
async def startup_event():
    # Store main loop so control.notify_ws_clients_threadsafe works from threads
    control.set_main_loop(asyncio.get_running_loop())
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.stop()
    player.stop()

# Only expose API under /api to avoid clashing with SPA client routes
app.include_router(users.router, prefix="/api")
app.include_router(scenes.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(control.router, prefix="/api")
app.include_router(logs.router, prefix="/api")

@app.get("/api/health")
def health():
    repo_root = settings.repo_root()
    web_path = settings.effective_web_dist()
    frontend_ok = bool(web_path and os.path.isdir(web_path))

    def tcp_open(host: str, port: int, timeout: float = 0.5) -> bool:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    def http_status(url: str, timeout: float = 0.8) -> int:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return getattr(resp, "status", 200)
        except Exception:
            return 0

    # Frontend static server (npx serve) check
    fe_port = int(os.getenv("FRONTEND_PORT", "9081") or 9081)
    frontend_server = "ok" if tcp_open("127.0.0.1", fe_port) else "down"

    # Proxy (nginx) checks
    proxy_tcp = tcp_open("127.0.0.1", 80)
    proxy_code_api = http_status("http://127.0.0.1/api/health")
    proxy_code_root = 0 if proxy_code_api and 200 <= proxy_code_api < 400 else http_status("http://127.0.0.1/")
    proxy = "ok" if (
        proxy_tcp and (
            (proxy_code_api and 200 <= proxy_code_api < 400) or (proxy_code_root and 200 <= proxy_code_root < 400)
        )
    ) else "down"

    # Cloudflared check: PID file + process alive
    cf_pidfile = os.path.join(repo_root, "logs", "cloudflared.pid")
    cloudflared = "stopped"
    try:
        if os.path.isfile(cf_pidfile):
            with open(cf_pidfile, "r") as f:
                pid_s = (f.read() or "").strip()
            if pid_s.isdigit():
                pid = int(pid_s)
                # os.kill(pid, 0) raises OSError if pid does not exist
                try:
                    os.kill(pid, 0)
                    cloudflared = "running"
                except Exception:
                    cloudflared = "stopped"
        else:
            cloudflared = "stopped"
    except Exception:
        cloudflared = "unknown"

    return {
        "backend": "ok",
    "frontend": "ok" if frontend_ok else "missing",
        "frontend_mode": os.getenv("FRONTEND_MODE", "auto"),
        "player": "ok" if player.is_playing() else "idle",
        "frontend_server": frontend_server,
        "proxy": proxy,
        "cloudflared": cloudflared,
        "_debug": {
            "proxy_tcp": proxy_tcp,
            "proxy_code_api": proxy_code_api,
            "proxy_code_root": proxy_code_root,
            "frontend_port": fe_port,
        }
    }

@app.get("/health", include_in_schema=False)
def legacy_health_redirect():
    return RedirectResponse(url="/api/health", status_code=307)

class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        norm = path.lstrip("/")
        debug = os.getenv("VIBRAE_SPA_DEBUG") == "1"
        def log(msg: str):
            if debug:
                print(f"[spa] {msg}: {norm}")
        if norm.startswith("api/"):
            return await super().get_response(norm, scope)
        # explicit file
        if "." in norm.rsplit("/", 1)[-1]:
            return await super().get_response(norm, scope)
        # variant auth/login -> auth/login.html
        html_path = os.path.join(self.directory, norm + ".html")  # type: ignore[attr-defined]
        if os.path.isfile(html_path):
            log("variant")
            return FileResponse(html_path, status_code=200, media_type="text/html")
        # directory style route
        if os.path.isdir(os.path.join(self.directory, norm)):  # type: ignore[attr-defined]
            idx = os.path.join(self.directory, "index.html")  # type: ignore[attr-defined]
            if os.path.isfile(idx):
                log("dir->index")
                return FileResponse(idx, status_code=200, media_type="text/html")
        # normal lookup
        resp = await super().get_response(norm, scope)
        if resp.status_code != 404:
            return resp
        idx = os.path.join(self.directory, "index.html")  # type: ignore[attr-defined]
        if os.path.isfile(idx):
            log("fallback index")
            return FileResponse(idx, status_code=200, media_type="text/html")
        return resp

# Always mount, even if directory missing at startup (check_dir=False) so it works after a later export
static_dir = web_dist or os.path.join(settings.repo_root(), "front", "dist")
app.mount("/", SPAStaticFiles(directory=static_dir, html=True, check_dir=False), name="frontend")
