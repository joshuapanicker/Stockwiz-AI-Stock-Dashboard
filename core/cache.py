"""Simple in-memory TTL cache for yfinance data, with stale-while-revalidate."""
import threading
import time
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}
_refreshing: set[str] = set()
_lock = threading.Lock()


def get(key: str, ttl: int) -> Any | None:
    entry = _store.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def set(key: str, value: Any) -> None:
    _store[key] = (time.time(), value)


def fetch_through(key: str, ttl: int, fetch_fn: Callable[[], Any],
                  stale_ttl: int | None = None) -> Any:
    """Read-through cache with stale-while-revalidate.

    - Fresh entry (< ttl old): return it.
    - Stale entry (< stale_ttl old): return it immediately and refresh in a
      background thread, so the caller never waits on the network for data
      we already have a usable copy of.
    - Missing/expired: fetch synchronously and cache.
    """
    entry = _store.get(key)
    now = time.time()
    if entry:
        age = now - entry[0]
        if age < ttl:
            return entry[1]
        if stale_ttl is not None and age < stale_ttl:
            _refresh_in_background(key, fetch_fn)
            return entry[1]
    value = fetch_fn()
    _store[key] = (time.time(), value)
    return value


def _refresh_in_background(key: str, fetch_fn: Callable[[], Any]) -> None:
    with _lock:
        if key in _refreshing:
            return
        _refreshing.add(key)

    def run():
        try:
            value = fetch_fn()
            _store[key] = (time.time(), value)
        except Exception:
            pass  # keep serving the stale value; next expiry retries
        finally:
            with _lock:
                _refreshing.discard(key)

    threading.Thread(target=run, daemon=True).start()
