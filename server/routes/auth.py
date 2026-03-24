import os
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import dynamo as db

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY         = os.getenv("SECRET_KEY", "ebam-secret-key-change-in-production")
ADMIN_USERNAME     = "admin"
ADMIN_PASSWORD     = os.getenv("ADMIN_PASSWORD", "admin")
TOKEN_EXPIRE_HOURS = 8


# ---------------------------------------------------------------------------
# Password hashing
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
# JWT
# ---------------------------------------------------------------------------

def create_token(username: str, role: str = "user") -> str:
    payload = {
        "sub":  username,
        "role": role,
        "exp":  datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def verify_token(token: str) -> bool:
    return decode_token(token) is not None


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

def require_auth(authorization: str | None = Header(default=None)):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_admin_role(authorization: str | None = Header(default=None)):
    token   = authorization.replace("Bearer ", "") if authorization else ""
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
def login(req: LoginRequest):
    if req.username == ADMIN_USERNAME and req.password == ADMIN_PASSWORD:
        return {"token": create_token(ADMIN_USERNAME, role="admin"), "role": "admin"}

    user = db.get_admin_user(req.username)
    if user and _check_password(req.password, user["password_hash"]):
        return {"token": create_token(req.username, role="user"), "role": "user"}

    raise HTTPException(status_code=401, detail="Invalid credentials")


# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    username: str
    password: str


class ResetPasswordRequest(BaseModel):
    password: str


@router.get("/users")
def list_users(_=Depends(require_admin_role)):
    return db.list_admin_users()


@router.post("/users")
def create_user(req: CreateUserRequest, _=Depends(require_admin_role)):
    if req.username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Cannot use reserved username 'admin'")
    if db.get_admin_user(req.username):
        raise HTTPException(status_code=409, detail=f"Username '{req.username}' already exists")
    db.create_admin_user(req.username, _hash_password(req.password))
    return {"message": f"User '{req.username}' created."}


@router.put("/users/{username}/password")
def reset_password(username: str, req: ResetPasswordRequest, _=Depends(require_admin_role)):
    if username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Use .env to change the admin password")
    if not db.get_admin_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    db.update_admin_user_password(username, _hash_password(req.password))
    return {"message": f"Password reset for '{username}'."}


@router.delete("/users/{username}")
def delete_user(username: str, _=Depends(require_admin_role)):
    if username == ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="Cannot delete built-in admin")
    if not db.get_admin_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    db.delete_admin_user(username)
    return {"message": f"User '{username}' deleted."}
