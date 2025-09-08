from vibrae_core import init_db as init_db_mod
from vibrae_core.init_db import init_db
from vibrae_core.db import Base, engine


def test_init_db_idempotent(monkeypatch):
    # Run twice with create_admin True to ensure no duplicate admin user creation errors.
    init_db(create_admin=True)
    init_db(create_admin=True)
    # Simple assertion: metadata tables exist
    assert engine is not None
    assert Base.metadata.tables
