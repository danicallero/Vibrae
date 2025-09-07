from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
from sqlalchemy.orm import Session
from vibrae_core.auth import get_current_user
from vibrae_core.db import SessionLocal
from vibrae_core.models import Scene

router = APIRouter(prefix="/scenes", tags=["scenes"])

MUSIC_DIR_ENV = os.getenv("MUSIC_DIR") or "music"
MUSIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../", MUSIC_DIR_ENV))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SceneCreateRequest(BaseModel):
    name: str
    path: str

class SceneUpdateRequest(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None

@router.get("/")
def list_scenes(user = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Scene).all()

@router.get("/folders/")
def list_music_folders(user = Depends(get_current_user)):
    try:
        folders = [f for f in os.listdir(MUSIC_DIR) if os.path.isdir(os.path.join(MUSIC_DIR, f)) and not f.startswith('.')]
        return {"folders": folders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_scene(data: SceneCreateRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    scene = Scene(name=data.name, path=data.path)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene

@router.delete("/{scene_id}/")
def delete_scene(scene_id: int, user = Depends(get_current_user), db: Session = Depends(get_db)):
    scene = db.query(Scene).filter(Scene.id == scene_id).first()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    db.delete(scene)
    db.commit()
    return {"status": "deleted"}

@router.put("/{scene_id}/")
def update_scene(scene_id: int, update: SceneUpdateRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
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
