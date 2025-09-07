"""Authentication helpers (migrated from legacy `backend.auth`).

Differences vs original:
 - Imports from vibrae_core.* instead of backend.*
 - Provides a development fallback SECRET_KEY if none is configured, so tests
   can run without an .env file present.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError, ExpiredSignatureError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from vibrae_core.db import SessionLocal
from vibrae_core.models import User

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():  # Silence warning if absent (common in tests)
    load_dotenv(dotenv_path=env_path, override=True)

SECRET_KEY = os.getenv("SECRET_KEY") or "dev-insecure-secret-key-change-me"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token_raw(token: str) -> Dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def decode_token(token: str) -> Dict:
    try:
        return decode_token_raw(token)
    except ExpiredSignatureError as e:  # pragma: no cover - branch specific
        raise ExpiredSignatureError("Token caducado") from e
    except JWTError as e:  # pragma: no cover - branch specific
        raise JWTError("Token inválido") from e


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:  # pragma: no cover - trivial
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="El token ha caducado. Inicia sesión de nuevo.")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido (sin sujeto)")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return user

__all__ = [
    "verify_password",
    "hash_password",
    "create_access_token",
    "decode_token_raw",
    "decode_token",
    "oauth2_scheme",
    "get_db",
    "get_current_user",
]
