"""ORM models (migrated from legacy `backend.models`)."""
from sqlalchemy import Column, Integer, String, ForeignKey
from vibrae_core.db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)


class Scene(Base):
    __tablename__ = "scenes"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    path = Column(String)


class Routine(Base):
    __tablename__ = "routines"
    id = Column(Integer, primary_key=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"))
    start_time = Column(String)  # e.g. "08:00"
    end_time = Column(String)
    weekdays = Column(String)    # e.g. "mon,tue,wed"
    months = Column(String)      # e.g "jan,feb,mar,apr"
    volume = Column(Integer)

__all__ = ["User", "Scene", "Routine"]
