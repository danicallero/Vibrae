# db.py
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.config import Settings

# Build an absolute path to the SQLite database under the repository's data/ folder
_settings = Settings()
_repo_root = _settings.repo_root()
_data_dir = os.path.join(_repo_root, "data")
os.makedirs(_data_dir, exist_ok=True)
_db_path = os.path.join(_data_dir, "garden.db")

DATABASE_URL = f"sqlite:///{_db_path}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
