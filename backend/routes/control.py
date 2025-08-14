# control.py
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from backend.auth import decode_token
from pydantic import BaseModel
import asyncio

router = APIRouter(prefix="/control", tags=["control"])

ws_clients = set()
main_loop = None  # will store reference to main asyncio loop


def set_main_loop(loop):
    """Called from app startup to store main loop."""
    global main_loop
    main_loop = loop


async def notify_ws_clients(data):
    """Async send to all connected WS clients."""
    for ws in list(ws_clients):
        try:
            await ws.send_json(data)
        except Exception:
            ws_clients.discard(ws)


def notify_ws_clients_threadsafe(data):
    """Safe to call from any thread."""
    if main_loop is None:
        return  # not ready yet
    asyncio.run_coroutine_threadsafe(notify_ws_clients(data), main_loop)


def notify_from_player(data, volume):
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": data})
    notify_ws_clients_threadsafe({"type": "volume", "volume": volume})


class BaseTokenRequest(BaseModel):
    token: str


@router.post("/volume")
def set_volume(level: int, request: BaseTokenRequest):
    if not request.token or not decode_token(request.token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    if not (0 <= level <= 100):
        raise HTTPException(status_code=400, detail="Volume must be 0-100")
    from backend.main import player
    player.set_volume(level)
    notify_ws_clients_threadsafe({"type": "volume", "volume": level})
    return {"status": "ok", "volume": level}


@router.post("/stop")
def stop_music(request: BaseTokenRequest):
    if not request.token or not decode_token(request.token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    from backend.main import player
    player.stop()
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": None})
    return {"status": "ok", "message": "Music stopped"}


@router.post("/now_playing")
def get_now_playing(request: BaseTokenRequest):
    if not request.token or not decode_token(request.token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    from backend.main import player
    return {"now_playing": player.get_now_playing()}


@router.post("/get_volume")
def get_volume(request: BaseTokenRequest):
    if not request.token or not decode_token(request.token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    from backend.main import player
    return {"volume": player.get_volume()}


@router.post("/resume")
def resume_schedule(request: BaseTokenRequest):
    if not request.token or not decode_token(request.token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    from backend.main import scheduler, player
    scheduler.resume_if_should_play()
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": player.get_now_playing()})
    notify_ws_clients_threadsafe({"type": "volume", "volume": player.get_volume()})
    return {"status": "ok", "message": "Schedule resumed if applicable"}


@router.websocket("/ws")
async def ws_updates(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    try:
        from backend.main import player
        await websocket.send_json({"type": "now_playing", "now_playing": player.get_now_playing()})
        await websocket.send_json({"type": "volume", "volume": player.get_volume()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(websocket)
    except Exception:
        ws_clients.discard(websocket)
        