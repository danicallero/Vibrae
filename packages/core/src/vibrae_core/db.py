"""Database setup (migrated from legacy `backend.db`).

Provides SQLAlchemy engine, session factory, and declarative base. Uses the
same on-disk SQLite database location logic via Settings().
"""
from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from vibrae_core.config import Settings

_settings = Settings()
_repo_root = _settings.repo_root()
_data_dir = os.path.join(_repo_root, "data")
os.makedirs(_data_dir, exist_ok=True)
_db_path = os.path.join(_data_dir, "garden.db")

DATABASE_URL = f"sqlite:///{_db_path}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

__all__ = [
    "DATABASE_URL",
    "engine",
    "SessionLocal",
    "Base",
]
