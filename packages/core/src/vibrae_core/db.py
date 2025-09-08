"""Database setup (migrated from legacy `backend.db`).

Provides SQLAlchemy engine, session factory, and declarative base.

Defaults to an on-disk SQLite database under ``data/garden.db`` at the
repository root, but respects an explicit environment override via
``VIBRAE_DB_URL`` (or ``VIBRAE_DATABASE_URL``) for testing or custom setups.
"""
from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from vibrae_core.config import Settings
from urllib.parse import urlparse

_settings = Settings()
_repo_root = _settings.repo_root()
_data_dir = os.path.join(_repo_root, "data")
os.makedirs(_data_dir, exist_ok=True)

# Allow env override for test or custom environments
_env_url = os.getenv("VIBRAE_DB_URL") or os.getenv("VIBRAE_DATABASE_URL")
if _env_url:
    # If pointing to a SQLite file, ensure its directory exists
    try:
        parsed = urlparse(_env_url)
        if parsed.scheme == "sqlite" and parsed.path and parsed.path != ":memory:":
            # parsed.path is an absolute path for sqlite URLs with 3+ slashes
            _dir = os.path.dirname(parsed.path)
            if _dir:
                os.makedirs(_dir, exist_ok=True)
    except Exception:
        # Best-effort; don't block startup on malformed URL here
        pass
    DATABASE_URL = _env_url
else:
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
