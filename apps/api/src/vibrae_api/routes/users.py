from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
from vibrae_core.db import SessionLocal
from vibrae_core.models import User
from vibrae_core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    ExpiredSignatureError,
    JWTError,
    oauth2_scheme,
    get_current_user,
)

router = APIRouter(prefix="/users", tags=["users"])

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class UserCreateRequest(BaseModel):
    username: str
    password: str
    admin_token: str

class UserLoginRequest(BaseModel):
    username: str
    password: str

@router.post("/")
@router.post("", include_in_schema=False)
def create_user(request: UserCreateRequest, db: Session = Depends(get_db)):
    first_userless = db.query(User).first() is None
    if not first_userless:
        if not ADMIN_TOKEN or request.admin_token != ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid admin token")
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(username=request.username, password_hash=hash_password(request.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username}

@router.post("/login")
@router.post("/login/", include_in_schema=False)
def login(request: UserLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Login no válido")
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/validate")
@router.post("/validate/", include_in_schema=False)
def validate_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="El token ha caducado. Inicia sesión de nuevo.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido.")
    return {"valid": True, "payload": payload}
