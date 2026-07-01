"""
JWT verification for FastAPI using Supabase-issued tokens.

Supabase signs JWTs with the project's JWT secret (found in
Project Settings → API → JWT Settings → JWT Secret).
We verify the token using python-jose and extract the user ID.

Usage in route:
    from core.auth import get_current_user
    @app.get("/api/protected")
    def protected(user_id: str = Depends(get_current_user)):
        ...
"""

from __future__ import annotations

import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

_bearer = HTTPBearer(auto_error=False)


def _get_jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET not set in environment")
    return secret


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """
    Verify the Bearer JWT and return the user's UUID.
    Raises 401 if missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase uses "authenticated" audience
        )
        user_id: str = payload.get("sub", "")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no subject")
        return user_id
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """
    Like get_current_user but returns None instead of raising for unauthenticated requests.
    Useful for endpoints that work both authenticated and unauthenticated.
    """
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None
