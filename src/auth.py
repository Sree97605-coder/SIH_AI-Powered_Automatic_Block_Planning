from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

PROJECT_ROOT = Path(__file__).resolve().parents[1]
USERS_DB_PATH = Path(os.environ.get("USERS_DB_PATH", "users.db"))
if not USERS_DB_PATH.is_absolute():
    USERS_DB_PATH = PROJECT_ROOT / USERS_DB_PATH

JWT_SECRET = os.environ.get("JWT_SECRET", "demo-only-change-this-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 8  # Deliberately demo-friendly; production sessions should be shorter.
VALID_ROLES = {"COA_ADMIN", "DEPT_ENGINEER", "DIVISION_HEAD"}
VALID_DEPARTMENTS = {"TMS", "SMMS", "TDMS"}
PASSWORD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")
BEARER = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    username: str
    role: str
    department: str | None


def ensure_users_db(path: Path = USERS_DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path))
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('COA_ADMIN','DEPT_ENGINEER','DIVISION_HEAD')),
            department TEXT CHECK(department IN ('TMS','SMMS','TDMS') OR department IS NULL),
            created_at TEXT NOT NULL
        )
        """
    )
    connection.commit()
    return connection


def hash_password(password: str) -> str:
    return PASSWORD_CONTEXT.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return PASSWORD_CONTEXT.verify(password, hashed_password)


def create_access_token(username: str, role: str, department: str | None) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    return jwt.encode(
        {
            "sub": username,
            "role": role,
            "department": department,
            "exp": expires_at,
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def authenticate_user(username: str, password: str) -> CurrentUser | None:
    connection = ensure_users_db()
    try:
        row = connection.execute(
            "SELECT username, hashed_password, role, department FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    finally:
        connection.close()

    if row is None or not verify_password(password, row[1]):
        return None
    return CurrentUser(username=row[0], role=row[2], department=row[3])


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(BEARER),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload: dict[str, Any] = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
        username = str(payload.get("sub", ""))
        role = str(payload.get("role", ""))
        department = payload.get("department")
        if not username or role not in VALID_ROLES:
            raise JWTError("missing identity claims")
        if department is not None and department not in VALID_DEPARTMENTS:
            raise JWTError("invalid department claim")
        return CurrentUser(username=username, role=role, department=department)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_roles(*roles: str):
    allowed_roles = set(roles)

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "reason": "insufficient_role",
                    "message": "Your role is not allowed to perform this action.",
                },
            )
        return user

    return dependency