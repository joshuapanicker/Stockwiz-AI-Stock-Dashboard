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
                   buy_price: float | None, notes: str,
                   shares: float = 1.0) -> dict:
    row = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "buy_date": buy_date,
        "buy_price": buy_price,
        "shares": shares,
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


def get_user_email(user_id: str) -> str | None:
    try:
        res = get_client().auth.admin.get_user_by_id(user_id)
        return res.user.email if res and res.user else None
    except Exception:
        return None


def delete_user_account(user_id: str) -> None:
    """
    Permanently delete a user and all their data.

    Every user-owned table (portfolios, sold_positions, user_alerts,
    user_criteria, user_profiles, plaid_connections, user_ai_usage,
    user_api_keys) references auth.users(id) with ON DELETE CASCADE, so
    removing the auth user cleans up everything else automatically.
    """
    get_client().auth.admin.delete_user(user_id)


# ── Sold positions ─────────────────────────────────────────────────────────

def record_sale(user_id: str, symbol: str, sell_date: str,
                sell_price: float, shares: float,
                buy_price: float | None, buy_date: str) -> dict:
    """Record a completed sale in sold_positions and remove from portfolios."""
    realized_gain = round((sell_price - (buy_price or 0)) * shares, 4) if buy_price else None
    realized_pct  = round((sell_price / buy_price - 1) * 100, 4) if buy_price and buy_price > 0 else None
    row = {
        "user_id": user_id,
        "symbol": symbol.upper(),
        "sell_date": sell_date,
        "sell_price": sell_price,
        "shares": shares,
        "buy_price": buy_price,
        "buy_date": buy_date,
        "realized_gain": realized_gain,
        "realized_pct": realized_pct,
    }
    get_client().table("sold_positions").insert(row).execute()
    # Remove from active holdings
    delete_holding(user_id, symbol)
    return row


def get_sold_positions(user_id: str) -> list[dict]:
    res = (get_client().table("sold_positions")
           .select("*")
           .eq("user_id", user_id)
           .order("sell_date", desc=True)
           .execute())
    return res.data or []


def delete_holdings_by_source(user_id: str, source: str) -> int:
    """
    Delete all portfolio holdings whose notes field contains `source`.
    Used to clean up Plaid-synced holdings when disconnecting a brokerage.
    Returns number of rows deleted.
    """
    res = (get_client().table("portfolios")
           .delete()
           .eq("user_id", user_id)
           .ilike("notes", f"%{source}%")
           .execute())
    return len(res.data) if res.data else 0


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
    try:
        res = (get_client().table("user_profiles")
               .select("*")
               .eq("user_id", user_id)
               .maybe_single()
               .execute())
        data = getattr(res, "data", None)
    except (AttributeError, TypeError):
        # Some PostgREST client versions return None for maybe_single() when
        # the user has not created a profile yet. That is a valid empty state.
        data = None
    if data:
        profile = {**DEFAULT_PROFILE, **data}
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
