"""Simple in-memory TTL cache for yfinance data."""
import time
from typing import Any

_store: dict[str, tuple[float, Any]] = {}

def get(key: str, ttl: int) -> Any | None:
    entry = _store.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None

def set(key: str, value: Any) -> None:
    _store[key] = (time.time(), value)
