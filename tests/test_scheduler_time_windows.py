from datetime import datetime
import pytest

try:
    from vibrae_core.scheduler import Scheduler
    from vibrae_core.player import Player
    from vibrae_core.db import SessionLocal, Base, engine
    from vibrae_core.models import Routine, Scene
except Exception as e:  # pragma: no cover
    pytest.skip(f"scheduler time tests skipped (import error: {e})", allow_module_level=True)


def setup_function():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        session.query(Routine).delete()
        session.query(Scene).delete()
        session.commit()
    finally:
        session.close()


def _mk_sched():
    return Scheduler(Player('.'), poll_interval=1)


def test_time_no_match_outside_window():
    sched = _mk_sched()
    session = SessionLocal()
    try:
        sc = Scene(path='.', name='x')
        session.add(sc)
        session.commit()
        r = Routine(scene_id=sc.id, start_time='10:00', end_time='12:00', weekdays='', months='', volume=50)
        session.add(r)
        session.commit()
    finally:
        session.close()
    now = datetime(2025, 9, 9, 9, 59)
    routine, scene = sched._get_current_routine_and_scene(now)
    assert routine is None and scene is None


def test_time_equal_start_end_is_no_match():
    sched = _mk_sched()
    session = SessionLocal()
    try:
        sc = Scene(path='.', name='y')
        session.add(sc)
        session.commit()
        r = Routine(scene_id=sc.id, start_time='08:00', end_time='08:00', weekdays='', months='', volume=50)
        session.add(r)
        session.commit()
    finally:
        session.close()
    now = datetime(2025, 9, 9, 8, 0)
    routine, scene = sched._get_current_routine_and_scene(now)
    assert routine is None and scene is None


def test_time_wrap_around_matches_correctly():
    sched = _mk_sched()
    session = SessionLocal()
    try:
        sc = Scene(path='.', name='z')
        session.add(sc)
        session.commit()
        r = Routine(scene_id=sc.id, start_time='22:00', end_time='06:00', weekdays='', months='', volume=50)
        session.add(r)
        session.commit()
    finally:
        session.close()
    # 01:00 should match
    now1 = datetime(2025, 9, 9, 1, 0)
    r1, s1 = sched._get_current_routine_and_scene(now1)
    assert r1 is not None and s1 is not None
    # 12:00 should not match
    now2 = datetime(2025, 9, 9, 12, 0)
    r2, s2 = sched._get_current_routine_and_scene(now2)
    assert r2 is None and s2 is None
