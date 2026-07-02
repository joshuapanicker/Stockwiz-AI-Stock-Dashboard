"""
Supabase database service layer.

All database operations go through this module using the service-role client,
which bypasses Row Level Security for server-side operations.
RLS is still applied when using the anon key from the frontend.

The service-role key is used here because the backend has already verified
the user's identity via JWT — we don't need the DB to re-check.
"""

from __future__ import annotations
import os
import json
from functools import lru_cache
from supabase import create_client, Client


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


# ── Portfolio ──────────────────────────────────────────────────────────────

def get_holdings(user_id: str) -> list[dict]:
    res = get_client().table("portfolios").select("*").eq("user_id", user_id).execute()
    return res.data or []


def upsert_holding(user_id: str, symbol: str, buy_date: str,
                   buy_price: float | None, notes: str) -> dict:
    row = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "buy_date": buy_date,
        "buy_price": buy_price,
        "notes": notes,
    }
    res = get_client().table("portfolios").upsert(row, on_conflict="user_id,symbol").execute()
    return res.data[0] if res.data else row


def delete_holding(user_id: str, symbol: str) -> bool:
    res = (get_client().table("portfolios")
           .delete()
           .eq("user_id", user_id)
           .eq("symbol", symbol.upper())
           .execute())
    return bool(res.data)


# ── Criteria ───────────────────────────────────────────────────────────────

def get_user_criteria(user_id: str) -> dict | None:
    """Return user's custom criteria JSON, or None if not set (use defaults)."""
    res = (get_client().table("user_criteria")
           .select("criteria")
           .eq("user_id", user_id)
           .maybe_single()
           .execute())
    if res.data:
        return res.data["criteria"]
    return None


def save_user_criteria(user_id: str, criteria: dict) -> None:
    get_client().table("user_criteria").upsert({
        "user_id": user_id,
        "criteria": criteria,
        "updated_at": "now()",
    }, on_conflict="user_id").execute()


# ── Investment profile ─────────────────────────────────────────────────────

DEFAULT_PROFILE = {
    "risk_tolerance": "moderate",
    "preferred_sectors": [],
    "hold_duration": "medium",
    "max_position_usd": 5000,
    "tax_sensitive": False,
    "notes": "",
}


def get_user_profile(user_id: str) -> dict:
    """Return user's investment profile, or defaults if not set."""
    res = (get_client().table("user_profiles")
           .select("*")
           .eq("user_id", user_id)
           .maybe_single()
           .execute())
    if res.data:
        profile = {**DEFAULT_PROFILE, **res.data}
        profile.pop("user_id", None)
        profile.pop("updated_at", None)
        return profile
    return dict(DEFAULT_PROFILE)


def save_user_profile(user_id: str, profile: dict) -> dict:
    row = {
        "user_id": user_id,
        "updated_at": "now()",
        **{k: v for k, v in profile.items() if k in DEFAULT_PROFILE},
    }
    get_client().table("user_profiles").upsert(row, on_conflict="user_id").execute()
    return get_user_profile(user_id)
