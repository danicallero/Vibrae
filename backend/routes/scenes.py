# scenes.py
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from backend.auth import decode_token
from backend.db import SessionLocal
from backend.models import Scene

router = APIRouter(prefix="/scenes", tags=["scenes"])

load_dotenv()
MUSIC_DIR_ENV = os.getenv("MUSIC_DIR")
MUSIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", MUSIC_DIR_ENV))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def token_from_header(Authorization: Optional[str] = Header(None)):
    if not Authorization or not Authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return decode_token(Authorization[len("Bearer "):])

class SceneCreateRequest(BaseModel):
    name: str
    path: str

class SceneUpdateRequest(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None

@router.get("/")
def list_scenes(token: dict = Depends(token_from_header), db: Session = Depends(get_db)):
    return db.query(Scene).all()

@router.get("/folders/")
def list_music_folders(token: dict = Depends(token_from_header)):
    try:
        folders = [
            f for f in os.listdir(MUSIC_DIR)
            if os.path.isdir(os.path.join(MUSIC_DIR, f)) and not f.startswith('.')
        ]
        return {"folders": folders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_scene(
    data: SceneCreateRequest,
    token: dict = Depends(token_from_header),
    db: Session = Depends(get_db)
):
    scene = Scene(name=data.name, path=data.path)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene

@router.delete("/{scene_id}/")
def delete_scene(
    scene_id: int,
    token: dict = Depends(token_from_header),
    db: Session = Depends(get_db)
):
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    db.delete(scene)
    db.commit()
    return {"status": "deleted"}

@router.put("/{scene_id}/")
def update_scene(
    scene_id: int,
    update: SceneUpdateRequest,
    token: dict = Depends(token_from_header),
    db: Session = Depends(get_db)
):
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    if update.name is not None:
        scene.name = update.name
    if update.path is not None:
        scene.path = update.path
    db.commit()
    db.refresh(scene)
    return scene
