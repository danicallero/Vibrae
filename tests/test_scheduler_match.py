from datetime import datetime
import pytest
try:
    from vibrae_core.scheduler import Scheduler
    from vibrae_core.player import Player
except Exception as e:  # pragma: no cover
    pytest.skip(f"scheduler tests skipped (player import error: {e})", allow_module_level=True)
from vibrae_core.db import SessionLocal, Base, engine
from vibrae_core.models import Routine, Scene


def setup_function():
    # Ensure tables exist and clean routine/scene tables for deterministic behavior
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        session.query(Routine).delete()
        session.query(Scene).delete()
        session.commit()
    finally:
        session.close()


def test_scheduler_routine_matching(monkeypatch):
    p = Player('.')
    sched = Scheduler(p, poll_interval=1)
    # Insert a scene and routine matching current time
    now = datetime.now()
    start = now.strftime('%H:%M')
    end_hour = (now.hour + 1) % 24
    end = f"{end_hour:02d}:{now.minute:02d}"
    session = SessionLocal()
    scene = Scene(path='.', name='root')
    session.add(scene)
    session.commit()
    routine = Routine(scene_id=scene.id, start_time=start, end_time=end, weekdays='', months='', volume=50)
    session.add(routine)
    session.commit()
    r, sc = sched._get_current_routine_and_scene(now)
    assert r is not None and sc is not None
    assert sc.id == scene.id
    session.close()
