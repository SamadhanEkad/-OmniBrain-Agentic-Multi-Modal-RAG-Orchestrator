"""
OmniBrain Core Authentication & Security Services.
Single source of truth re-exported from Routers.auth for backward compatibility.
"""

from Routers.auth import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    pwd_context,
    oauth2_scheme,
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    get_current_admin,
    router,
    LoginRequest,
    RegisterRequest,
)

__all__ = [
    "SECRET_KEY",
    "ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "pwd_context",
    "oauth2_scheme",
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "get_current_user",
    "get_current_admin",
    "router",
    "LoginRequest",
    "RegisterRequest",
]