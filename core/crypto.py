"""
Application-level encryption for secrets at rest — user-supplied Anthropic
API keys and Plaid access tokens. Defense-in-depth on top of Supabase's
row-level security and disk encryption: even a service-role-key leak or a
database dump yields ciphertext instead of usable credentials.

Backward-compatible and inert-until-configured:
  - If STOCKBROOK_ENCRYPTION_KEY is unset, encrypt()/decrypt() are no-ops, so
    behavior is identical to today (values stored/read as plaintext).
  - decrypt() transparently passes through values that aren't valid
    ciphertext, so rows written before a key was configured keep working —
    they get upgraded to ciphertext the next time they're written.

Generate a key:
    py -3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
Set the output as STOCKBROOK_ENCRYPTION_KEY in the backend environment.
Losing or rotating the key makes previously-encrypted values unrecoverable,
so store it alongside your other production secrets.
"""

from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def _fernet():
    # Renamed from STOCKWIZ_ENCRYPTION_KEY during the Stockbrook rebrand —
    # old name still read as a fallback in case it's already set in Railway.
    key = (os.environ.get("STOCKBROOK_ENCRYPTION_KEY", "").strip()
           or os.environ.get("STOCKWIZ_ENCRYPTION_KEY", "").strip())
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode())
    except Exception:
        # Misconfigured key: fail safe to plaintext passthrough rather than
        # taking down every credential read/write in the app.
        return None


def encrypt(value: str | None) -> str | None:
    """Encrypt a secret for storage. No-op if encryption isn't configured."""
    if not value:
        return value
    f = _fernet()
    if f is None:
        return value
    try:
        return f.encrypt(value.encode()).decode()
    except Exception:
        return value


def decrypt(value: str | None) -> str | None:
    """Decrypt a stored secret. Passes plaintext/legacy values through
    unchanged so rows written before encryption was enabled still work."""
    if not value:
        return value
    f = _fernet()
    if f is None:
        return value
    try:
        from cryptography.fernet import InvalidToken
        try:
            return f.decrypt(value.encode()).decode()
        except InvalidToken:
            return value  # stored before encryption was enabled — return as-is
    except Exception:
        return value
