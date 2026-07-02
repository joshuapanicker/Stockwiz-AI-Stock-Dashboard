"""
JWT verification for FastAPI using Supabase-issued tokens.
Uses the Supabase admin client to verify tokens directly — more reliable
than manual JWT decoding which can fail with special characters in secrets.
"""

from __future__ import annotations

import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_bearer = HTTPBearer(auto_error=False)


def _verify_with_supabase(token: str) -> str | None:
    """Verify token using Supabase admin client and return user_id, or None."""
    try:
        from core.db import get_client
        result = get_client().auth.get_user(token)
        if result and result.user:
            return result.user.id
        return None
    except Exception:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = _verify_with_supabase(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    if credentials is None:
        return None
    return _verify_with_supabase(credentials.credentials)
