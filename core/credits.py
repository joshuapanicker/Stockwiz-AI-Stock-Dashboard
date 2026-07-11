"""
AI credit metering and user-supplied API keys.

Every user gets FREE_MONTHLY_TOKENS of Claude usage per calendar month on the
app's shared ANTHROPIC_API_KEY. Users can instead store their own Anthropic
key (server-side only, never returned to the client), in which case their
usage is unmetered and billed to them.

Tables (see supabase_credits.sql):
  user_ai_usage  — (user_id, period 'YYYY-MM') → tokens_used
  user_api_keys  — user_id → anthropic_key   (service-role access only)

When Supabase isn't configured (local dev), usage falls back to a JSON file
so the flow is still testable.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

import anthropic

# ~80-100 typical AI interactions per month; worst case well under $1/user
# on claude-haiku pricing.
FREE_MONTHLY_TOKENS = int(os.environ.get("FREE_MONTHLY_TOKENS", 200_000))
WARN_PCT = 0.80

# Comma-separated Supabase user IDs exempt from metering (app owner/testers).
# Still uses the shared ANTHROPIC_API_KEY, just never capped or counted.
_ADMIN_USER_IDS = {
    uid.strip() for uid in os.environ.get("ADMIN_USER_IDS", "").split(",") if uid.strip()
}


def _is_admin(user_id: str | None) -> bool:
    return bool(user_id) and user_id in _ADMIN_USER_IDS

_LOCAL_USAGE_PATH = Path(__file__).parent.parent / "data" / "ai_usage.json"
_local_lock = threading.Lock()


class CreditsExhausted(Exception):
    """Raised when a metered user has no free tokens left this month."""


def _period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _supabase():
    """Service-role client, or None when not configured (local dev)."""
    try:
        from core.db import get_client
        return get_client()
    except Exception:
        return None


# ── Usage tracking ──────────────────────────────────────────────────────────

def _local_usage_read() -> dict:
    try:
        return json.loads(_LOCAL_USAGE_PATH.read_text())
    except Exception:
        return {}


def get_tokens_used(user_id: str) -> int:
    period = _period()
    sb = _supabase()
    if sb:
        res = (sb.table("user_ai_usage").select("tokens_used")
               .eq("user_id", user_id).eq("period", period).execute())
        return int(res.data[0]["tokens_used"]) if res.data else 0
    return int(_local_usage_read().get(f"{user_id}:{period}", 0))


def add_tokens_used(user_id: str, tokens: int) -> None:
    if tokens <= 0 or not user_id:
        return
    period = _period()
    sb = _supabase()
    if sb:
        current = get_tokens_used(user_id)
        (sb.table("user_ai_usage")
         .upsert({"user_id": user_id, "period": period,
                  "tokens_used": current + tokens,
                  "updated_at": datetime.now(timezone.utc).isoformat()},
                 on_conflict="user_id,period")
         .execute())
        return
    with _local_lock:
        data = _local_usage_read()
        key = f"{user_id}:{period}"
        data[key] = int(data.get(key, 0)) + tokens
        _LOCAL_USAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _LOCAL_USAGE_PATH.write_text(json.dumps(data))


# ── User API keys ───────────────────────────────────────────────────────────

def get_user_api_key(user_id: str | None) -> str | None:
    if not user_id:
        return None
    sb = _supabase()
    if not sb:
        return None
    try:
        from core.crypto import decrypt
        res = (sb.table("user_api_keys").select("anthropic_key")
               .eq("user_id", user_id).execute())
        key = res.data[0]["anthropic_key"] if res.data else None
        key = decrypt(key)
        return key.strip() if key else None
    except Exception:
        return None


def set_user_api_key(user_id: str, key: str) -> None:
    sb = _supabase()
    if not sb:
        raise RuntimeError("Supabase not configured")
    from core.crypto import encrypt
    (sb.table("user_api_keys")
     .upsert({"user_id": user_id, "anthropic_key": encrypt(key.strip()),
              "updated_at": datetime.now(timezone.utc).isoformat()},
             on_conflict="user_id")
     .execute())


def delete_user_api_key(user_id: str) -> None:
    sb = _supabase()
    if not sb:
        return
    sb.table("user_api_keys").delete().eq("user_id", user_id).execute()


def validate_api_key(key: str) -> bool:
    """Cheap validation: format check + a free models.list call."""
    key = key.strip()
    if not key.startswith("sk-ant-") or len(key) < 40:
        return False
    try:
        anthropic.Anthropic(api_key=key).models.list(limit=1)
        return True
    except Exception:
        return False


# ── Key resolution + metered calls ─────────────────────────────────────────

def resolve_api_key(user_id: str | None) -> tuple[str, bool]:
    """
    Return (api_key, metered). Own key → unmetered. Shared key → metered,
    raising CreditsExhausted when the monthly allowance is used up.
    """
    own = get_user_api_key(user_id)
    if own:
        return own, False
    if _is_admin(user_id):
        shared = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not shared:
            raise RuntimeError("ANTHROPIC_API_KEY not set.")
        return shared, False
    if user_id and get_tokens_used(user_id) >= FREE_MONTHLY_TOKENS:
        raise CreditsExhausted(
            "You've used all your free AI credits for this month. "
            "Add your own Anthropic API key in your profile to keep using AI features."
        )
    shared = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not shared:
        raise RuntimeError("ANTHROPIC_API_KEY not set.")
    return shared, True


def metered_create(user_id: str | None, **kwargs):
    """messages.create with per-user key resolution and usage recording."""
    api_key, metered = resolve_api_key(user_id)
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(**kwargs)
    if metered and user_id and getattr(response, "usage", None):
        add_tokens_used(user_id, response.usage.input_tokens + response.usage.output_tokens)
    return response


def credits_status(user_id: str) -> dict:
    has_key = bool(get_user_api_key(user_id))
    if has_key or _is_admin(user_id):
        return {
            "has_own_key": has_key,
            "unlimited": True,
            "metered": False,
            "tokens_used": 0,
            "token_limit": FREE_MONTHLY_TOKENS,
            "remaining": FREE_MONTHLY_TOKENS,
            "pct_used": 0.0,
            "warning": False,
            "exhausted": False,
            "period": _period(),
        }
    used = get_tokens_used(user_id)
    pct = min(used / FREE_MONTHLY_TOKENS, 1.0) if FREE_MONTHLY_TOKENS else 1.0
    return {
        "has_own_key": False,
        "unlimited": False,
        "metered": True,
        "tokens_used": used,
        "token_limit": FREE_MONTHLY_TOKENS,
        "remaining": max(FREE_MONTHLY_TOKENS - used, 0),
        "pct_used": round(pct, 4),
        "warning": pct >= WARN_PCT,
        "exhausted": used >= FREE_MONTHLY_TOKENS,
        "period": _period(),
    }
