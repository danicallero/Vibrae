from fastapi import APIRouter, Depends, HTTPException
import logging
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from vibrae_core.auth import get_current_user
from vibrae_core.db import SessionLocal
from vibrae_core.models import Routine

router = APIRouter(prefix="/schedule", tags=["schedule"])
log = logging.getLogger("vibrae_api")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RoutineCreateRequest(BaseModel):
    scene_id: int
    start_time: str
    end_time: str
    weekdays: str
    months: str
    volume: int

class RoutineUpdateRequest(BaseModel):
    scene_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    weekdays: Optional[str] = None
    months: Optional[str] = None
    volume: Optional[int] = None

@router.get("/")
def list_routines(user = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Routine).all()
    log.info("schedule.list count=%d actor=%s", len(items), getattr(user, "username", "?"))
    return items

@router.post("/")
def create_routine(data: RoutineCreateRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    routine = Routine(
        scene_id=data.scene_id,
        start_time=data.start_time,
        end_time=data.end_time,
        weekdays=data.weekdays,
        months=data.months,
        volume=data.volume,
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    log.info("schedule.create id=%s actor=%s", routine.id, getattr(user, "username", "?"))
    return routine

@router.put("/{routine_id}")
def update_routine(routine_id: int, update: RoutineUpdateRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        log.warning("schedule.update not_found id=%s actor=%s", routine_id, getattr(user, "username", "?"))
        raise HTTPException(status_code=404, detail="Routine not found")
    if update.scene_id is not None:
        routine.scene_id = update.scene_id
    if update.start_time is not None:
        routine.start_time = update.start_time
    if update.end_time is not None:
        routine.end_time = update.end_time
    if update.weekdays is not None:
        routine.weekdays = update.weekdays if update.weekdays != "" else None
    if update.months is not None:
        routine.months = update.months if update.months != "" else None
    if update.volume is not None:
        routine.volume = update.volume
    db.commit()
    db.refresh(routine)
    log.info("schedule.update ok id=%s actor=%s", routine.id, getattr(user, "username", "?"))
    return routine

@router.delete("/{routine_id}/")
def delete_routine(routine_id: int, user = Depends(get_current_user), db: Session = Depends(get_db)):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        log.warning("schedule.delete not_found id=%s actor=%s", routine_id, getattr(user, "username", "?"))
        raise HTTPException(status_code=404, detail="Routine not found")
    db.delete(routine)
    db.commit()
    log.info("schedule.delete ok id=%s actor=%s", routine_id, getattr(user, "username", "?"))
    return {"status": "deleted"}
