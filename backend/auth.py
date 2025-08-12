from jose import jwt, JWTError, ExpiredSignatureError
from passlib.context import CryptContext
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os
from typing import Optional, Dict

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Configuración
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

# Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# Crear token con caducidad
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    print(f"key: {SECRET_KEY}")
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token_raw(token: str) -> Dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

# Decodificar token con manejo de errores
def decode_token(token: str) -> Dict:
    try:
        return decode_token_raw(token)
    except ExpiredSignatureError:
        raise ExpiredSignatureError("Token caducado")
    except JWTError:
        raise JWTError("Token inválido")
