# init_db.py
# SPDX-License-Identifier: GPL-3.0-or-later

from backend.db import Base, engine
from backend.models import User, Scene, Routine

Base.metadata.create_all(bind=engine)