from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, status
import logging
import asyncio
from typing import Optional, Set
from vibrae_core.auth import decode_token, get_current_user
from vibrae_core.player import register_player_listener, unregister_player_listener

router = APIRouter(prefix="/control", tags=["control"])
api_log = logging.getLogger("vibrae_api")

# Dedicated logger for websocket lifecycle
ws_logger = logging.getLogger("vibrae_api.ws")

ws_clients: Set[WebSocket] = set()
main_loop = None

def set_main_loop(loop):
    global main_loop
    main_loop = loop

async def notify_ws_clients(data):
    for ws in list(ws_clients):
        try:
            await ws.send_json(data)
        except Exception:
            ws_clients.discard(ws)

def notify_ws_clients_threadsafe(data):
    if main_loop is None:
        return
    asyncio.run_coroutine_threadsafe(notify_ws_clients(data), main_loop)

def _player_listener(song: Optional[str], volume: Optional[int]):
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": song})
    if volume is not None:
        notify_ws_clients_threadsafe({"type": "volume", "volume": volume})

register_player_listener(_player_listener)

@router.post("/volume")
def set_volume(level: int, user = Depends(get_current_user)):
    if not (0 <= level <= 100):
        raise HTTPException(status_code=400, detail="Volume must be 0-100")
    from apps.api.src.vibrae_api.main import player
    player.set_volume(level)
    notify_ws_clients_threadsafe({"type": "volume", "volume": level})
    api_log.info("control.volume level=%d actor=%s", level, getattr(user, "username", "?"))
    return {"status": "ok", "volume": level}

@router.post("/stop")
def stop_music(user = Depends(get_current_user)):
    from apps.api.src.vibrae_api.main import player
    player.stop()
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": None})
    api_log.info("control.stop actor=%s", getattr(user, "username", "?"))
    return {"status": "ok", "message": "Music stopped"}

@router.post("/now_playing")
def get_now_playing(user = Depends(get_current_user)):
    from apps.api.src.vibrae_api.main import player
    api_log.info("control.now_playing actor=%s", getattr(user, "username", "?"))
    return {"now_playing": player.get_now_playing()}

@router.post("/get_volume")
def get_volume(user = Depends(get_current_user)):
    from apps.api.src.vibrae_api.main import player
    api_log.info("control.get_volume actor=%s", getattr(user, "username", "?"))
    return {"volume": player.get_volume()}

@router.post("/resume")
def resume_schedule(user = Depends(get_current_user)):
    from apps.api.src.vibrae_api.main import scheduler, player
    scheduler.resume_if_should_play()
    notify_ws_clients_threadsafe({"type": "now_playing", "now_playing": player.get_now_playing()})
    notify_ws_clients_threadsafe({"type": "volume", "volume": player.get_volume()})
    api_log.info("control.resume actor=%s", getattr(user, "username", "?"))
    return {"status": "ok", "message": "Schedule resumed if applicable"}

@router.get("/status")
def get_status():
    from apps.api.src.vibrae_api.main import player, scheduler
    player_status = "online" if player.is_initialized() else "offline"
    scheduler_status = "online" if scheduler.is_initialized() else "offline"
    overall_status = "online" if player_status == "online" and scheduler_status == "online" else "offline"
    api_log.info("control.status overall=%s player=%s scheduler=%s", overall_status, player_status, scheduler_status)
    return {"status": overall_status, "details": {"player": player_status, "scheduler": scheduler_status}}

@router.websocket("/ws")
async def ws_updates(websocket: WebSocket):
    client = getattr(websocket, "client", None)
    client_str = f"{client.host}:{client.port}" if hasattr(client, "host") else "unknown"
    token = websocket.query_params.get("token")
    if not token:
        ws_logger.warning("WS reject: missing token from %s", client_str)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        decode_token(token)
    except Exception:
        ws_logger.warning("WS reject: invalid token from %s", client_str)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    ws_logger.info("WS accepted from %s", client_str)
    ws_clients.add(websocket)
    try:
        from apps.api.src.vibrae_api.main import player
        await websocket.send_json({"type": "now_playing", "now_playing": player.get_now_playing()})
        await websocket.send_json({"type": "volume", "volume": player.get_volume()})
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        ws_clients.discard(websocket)
        ws_logger.info("WS disconnected %s", client_str)
