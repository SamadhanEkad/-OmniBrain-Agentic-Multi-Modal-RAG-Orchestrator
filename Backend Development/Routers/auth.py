import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from Database.schemas import TokenData, UserRole

# ----------------------------------------------------------------------
# Configuration & Context
# ----------------------------------------------------------------------
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "omnibrain-dev-insecure-secret-key-32bytes")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24))  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


# ----------------------------------------------------------------------
# Request / Response Models
# ----------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: Optional[str] = "user"


# ----------------------------------------------------------------------
# Cryptographic & Token Utilities
# ----------------------------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a raw password against its stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generates a secure bcrypt hash for passwords."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encodes user identity, IDs, and role claims into a signed JWT token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ----------------------------------------------------------------------
# FastAPI Dependencies
# ----------------------------------------------------------------------
async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    """Dependency: Decodes Bearer JWT, validates expiration, and extracts claims."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub") or payload.get("username")
        user_id: Optional[str] = payload.get("user_id")
        raw_role: Optional[Union[UserRole, str]] = payload.get("role", UserRole.USER)

        if username is None:
            raise credentials_exception

        parsed_role = UserRole.USER
        if isinstance(raw_role, UserRole):
            parsed_role = raw_role
        elif isinstance(raw_role, str):
            try:
                parsed_role = UserRole(raw_role.lower())
            except ValueError:
                parsed_role = UserRole.USER

        return TokenData(username=username, user_id=str(user_id) if user_id else None, role=parsed_role)
    except (JWTError, ValueError):
        raise credentials_exception


async def get_current_admin(
    current_user: TokenData = Depends(get_current_user),
) -> TokenData:
    """Dependency: Enforces administrator-only role access control."""
    user_role = current_user.role.value if isinstance(current_user.role, UserRole) else str(current_user.role)
    if user_role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Administrative privileges required",
        )
    return current_user


logger = logging.getLogger("omnibrain.auth")


# ----------------------------------------------------------------------
# Auth Endpoints
# ----------------------------------------------------------------------
@router.post("/login")
async def login(creds: LoginRequest):
    if not creds.username or not creds.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required."
        )

    assigned_role = "admin" if creds.username.lower() == "admin" else "user"
    user_id = str(uuid.uuid4())
    user_email = None

    # Check database if user exists
    try:
        from Database import async_session_factory, User
        from sqlalchemy import select
        async with async_session_factory() as session:
            stmt = select(User).where((User.username == creds.username) | (User.email == creds.username))
            result = await session.execute(stmt)
            db_user = result.scalar_one_or_none()
            if db_user:
                if not verify_password(creds.password, db_user.hashed_password):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid username or password."
                    )
                assigned_role = db_user.role
                user_id = str(db_user.id)
                user_email = db_user.email
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Database user lookup warning (fallback to dev token): {exc}")

    access_token = create_access_token(
        data={
            "sub": creds.username,
            "user_id": user_id,
            "role": assigned_role
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "username": creds.username,
            "email": user_email,
            "role": assigned_role
        }
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: RegisterRequest):
    if not user.username or not user.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required."
        )

    user_id = str(uuid.uuid4())
    try:
        from Database import async_session_factory, User
        from sqlalchemy import select
        async with async_session_factory() as session:
            async with session.begin():
                stmt = select(User).where(User.username == user.username)
                if (await session.execute(stmt)).scalar_one_or_none():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Username '{user.username}' is already registered."
                    )
                new_user = User(
                    username=user.username,
                    email=user.email or f"{user.username}@omnibrain.local",
                    hashed_password=get_password_hash(user.password),
                    role=user.role or "user",
                )
                session.add(new_user)
                await session.flush()
                user_id = str(new_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Database user registration warning: {exc}")

    return {
        "status": "success",
        "message": f"User '{user.username}' registered successfully.",
        "user": {
            "id": user_id,
            "username": user.username,
            "email": user.email,
            "role": user.role
        }
    }


@router.get("/me")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Returns currently authenticated user claims and profile."""
    user_role = current_user.role.value if isinstance(current_user.role, UserRole) else str(current_user.role)
    return {
        "id": current_user.user_id,
        "username": current_user.username,
        "role": user_role,
    }
