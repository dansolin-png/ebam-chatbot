import os
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from database import get_db
from models import AdminUser

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY         = os.getenv("SECRET_KEY", "ebam-secret-key-change-in-production")
ADMIN_USERNAME     = "admin"
ADMIN_PASSWORD     = os.getenv("ADMIN_PASSWORD", "admin")
TOKEN_EXPIRE_HOURS = 8


# ---------------------------------------------------------------------------
# Password hashing (stdlib only — no extra deps)
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: str | None = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}:{h.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split(":", 1)
        return _hash_password(password, salt) == stored
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(username: str, role: str = "user") -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def verify_token(token: str) -> bool:
    return decode_token(token) is not None


def get_token_role(token: str) -> str | None:
    payload = decode_token(token)
    return payload.get("role") if payload else None


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

def require_auth(authorization: str | None = Header(default=None)):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_admin_role(authorization: str | None = Header(default=None)):
    token = authorization.replace("Bearer ", "") if authorization else ""
    payload = decode_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(req: LoginRequest, db: DBSession = Depends(get_db)):
    # Check built-in admin first
    if req.username == ADMIN_USERNAME and req.password == ADMIN_PASSWORD:
        return {"token": create_token(ADMIN_USERNAME, role="admin"), "role": "admin"}

    # Check DB users
    user = db.query(AdminUser).filter(AdminUser.username == req.username).first()
    if user and _check_password(req.password, user.password_hash):
        return {"token": create_token(req.username, role="user"), "role": "user"}

    raise HTTPException(status_code=401, detail="Invalid credentials")


# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    username: str
    password: str


@router.get("/users")
def list_users(db: DBSession = Depends(get_db), _=Depends(require_admin_role)):
    users = db.query(AdminUser).order_by(AdminUser.created_at).all()
    return [{"id": u.id, "username": u.username, "created_at": u.created_at} for u in users]


@router.post("/users")
def create_user(req: CreateUserRequest, db: DBSession = Depends(get_db), _=Depends(require_admin_role)):
    if req.username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Cannot create a user with the reserved username 'admin'")
    existing = db.query(AdminUser).filter(AdminUser.username == req.username).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{req.username}' already exists")
    user = AdminUser(username=req.username, password_hash=_hash_password(req.password))
    db.add(user)
    db.commit()
    return {"message": f"User '{req.username}' created.", "id": user.id}


class ResetPasswordRequest(BaseModel):
    password: str


@router.put("/users/{username}/password")
def reset_password(username: str, req: ResetPasswordRequest, db: DBSession = Depends(get_db), _=Depends(require_admin_role)):
    if username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Use .env to change the admin password")
    user = db.query(AdminUser).filter(AdminUser.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = _hash_password(req.password)
    db.commit()
    return {"message": f"Password reset for '{username}'."}


@router.delete("/users/{username}")
def delete_user(username: str, db: DBSession = Depends(get_db), _=Depends(require_admin_role)):
    if username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Cannot delete the built-in admin user")
    user = db.query(AdminUser).filter(AdminUser.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": f"User '{username}' deleted."}
