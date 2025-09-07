"""Database initialization helper for Vibrae.

Creates all tables and optional seed data (admin user, default scenes).
Intended replacement for legacy backend.init_db module.
"""
from __future__ import annotations
import os
from sqlalchemy.orm import Session
from .db import Base, engine
from .models import User, Scene, Routine  # adjust exports as needed
from .auth import get_password_hash

DEFAULT_ADMIN_USER = os.environ.get("VIBRAE_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASS = os.environ.get("VIBRAE_ADMIN_PASS", "admin")


def init_db(create_admin: bool = True) -> None:
    """Create tables and optional seed records.

    Parameters
    ----------
    create_admin: bool
        If True and no users exist, create an initial admin user with
        environment-provided credentials (VIBRAE_ADMIN_USER/VIBRAE_ADMIN_PASS).
    """
    Base.metadata.create_all(bind=engine)
    if not create_admin:
        return
    with Session(engine) as session:
        user_count = session.query(User).count()
        if user_count == 0:
            admin = User(username=DEFAULT_ADMIN_USER, hashed_password=get_password_hash(DEFAULT_ADMIN_PASS))
            session.add(admin)
            session.commit()

if __name__ == "__main__":  # pragma: no cover
    init_db()
