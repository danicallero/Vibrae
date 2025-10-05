"""Authentication helpers."""

# Standard library
import logging
import warnings
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Iterator

# Third-party
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError, ExpiredSignatureError
from sqlalchemy.orm import Session

# Local
from vibrae_core.db import SessionLocal
from vibrae_core.models import User
from vibrae_core.config import Settings


try:  # Optional dependency; provide lightweight fallback for test environments
    from passlib.context import CryptContext  # type: ignore
except Exception:  # pragma: no cover
    class _DummyHasher:
        """Fallback hasher using PBKDF2-HMAC(SHA-256) if passlib is unavailable.

        Uses static salt and iteration count from env for test determinism.
        Also supports legacy SHA-256(salt+password) hashes for backward compatibility.
        """

        def __init__(self) -> None:
            self._salt = os.getenv("VIBRAE_HASH_SALT", "static-test-salt").encode()
            # Reasonable default for CPU-only tests; production should use passlib/bcrypt
            self._iterations = int(os.getenv("VIBRAE_PBKDF2_ITERATIONS", "200000"))

        def hash(self, password: str) -> str:
            import hashlib
            dk = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), self._salt, self._iterations
            )
            return f"pbkdf2_sha256${self._iterations}${self._salt.hex()}${dk.hex()}"

        def verify(self, plain: str, hashed: str) -> bool:
            import hashlib
            # Try to parse our PBKDF2 format first
            try:
                algo, iters_s, salt_hex, dk_hex = hashed.split("$", 3)
                if algo == "pbkdf2_sha256":
                    iters = int(iters_s)
                    salt = bytes.fromhex(salt_hex)
                    dk = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, iters)
                    return dk.hex() == dk_hex
            except ValueError:
                # fall back to legacy check
                pass

            # Back-compat: legacy plain SHA-256(salt+password) hex digest
            legacy = hashlib.sha256(self._salt + plain.encode()).hexdigest()
            return legacy == hashed

    class CryptContext:  # type: ignore
        def __init__(self, *a, **kw):
            self._impl = _DummyHasher()

        def hash(self, password: str) -> str:
            return self._impl.hash(password)

        def verify(self, plain: str, hashed: str) -> bool:
            return self._impl.verify(plain, hashed)


# Load env from backend file
Settings().load_backend_env()

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY") or "dev-insecure-secret-key-change-me"

if SECRET_KEY == "dev-insecure-secret-key-change-me":
    warnings.warn(
        "Using insecure default SECRET_KEY. Set a proper one in your environment!",
        RuntimeWarning,
    )
    logger.warning("auth: insecure default SECRET_KEY in use; set a proper one in env")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a hashed value."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Return a hashed representation of ``password``."""
    return pwd_context.hash(password)


# Backwards compatibility: legacy name expected by init_db
def get_password_hash(password: str) -> str:
    return hash_password(password)


def authenticate_user(username: str, password: str, db: Session) -> Optional[User]:
    """Authenticate a user by username and password.
    Verifies whether the user exists in the DB and the password is correct.
    Returns the ``User`` instance when authentication succeeds.
    """
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, getattr(user, "password_hash", "")):
        return None
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token containing ``data``.

    note: accepts a dict (e.g., {"sub": username}).
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token


def decode_token_raw(token: str) -> Dict:
    """Decode a JWT token without translating exceptions."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def decode_token(token: str) -> Dict:
    """Safe decode a JWT token with controlled exceptions."""
    try:
        return decode_token_raw(token)
    except ExpiredSignatureError as e:  # pragma: no cover
        raise ExpiredSignatureError("Token expired") from e
    except JWTError as e:  # pragma: no cover
        raise JWTError("Invalid token") from e


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/login")


def get_db() -> Iterator[Session]:
    """Yield a SQLAlchemy session and ensure it's closed after use."""
    db = SessionLocal()
    try:
        yield db
    finally:  # pragma: no cover
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Resolve the current user from a bearer token."""
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        logging.getLogger("vibrae_api.auth").warning("auth.token expired")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="expired token")
    except JWTError:
        logging.getLogger("vibrae_api.auth").warning("auth.token invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    username = payload.get("sub")
    if not username:
        logging.getLogger("vibrae_api.auth").warning("auth.token missing_sub")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token: no subject")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        logging.getLogger("vibrae_api.auth").warning("auth.user not_found sub=%s", username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token: user not found")
    logging.getLogger("vibrae_api.auth").info("auth.user ok sub=%s", username)
    return user


__all__ = [
    "verify_password",
    "hash_password",
    "get_password_hash",
    "create_access_token",
    "decode_token_raw",
    "decode_token",
    "oauth2_scheme",
    "get_db",
    "get_current_user",
]
