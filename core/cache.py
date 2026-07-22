"""Simple in-memory TTL cache for yfinance data, with stale-while-revalidate."""
import os
import threading
import time
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}
_refreshing: set[str] = set()
_lock = threading.Lock()

# Hard cap on entries so the cache can't grow unbounded on a small container.
# Each entry can hold ~1y of daily history (~252 dicts); left uncapped the
# store only ever evicted on TTL-read, so symbols viewed once stayed forever.
# When full, evict the oldest entries (by insertion time). Env-tunable.
_MAX_ENTRIES = int(os.getenv("CACHE_MAX_ENTRIES", "512"))


def _evict_if_needed() -> None:
    """Evict oldest entries once over the cap. Caller need not hold a lock —
    dict operations here are individually atomic under CPython's GIL."""
    over = len(_store) - _MAX_ENTRIES
    if over <= 0:
        return
    # Oldest by stored timestamp; trim a batch so we don't evict on every set.
    victims = sorted(_store.items(), key=lambda kv: kv[1][0])[: over + 32]
    for key, _ in victims:
        _store.pop(key, None)


def get(key: str, ttl: int) -> Any | None:
    entry = _store.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def set(key: str, value: Any) -> None:
    _store[key] = (time.time(), value)
    _evict_if_needed()


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
    _evict_if_needed()
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
            _evict_if_needed()
        except Exception:
            pass  # keep serving the stale value; next expiry retries
        finally:
            with _lock:
                _refreshing.discard(key)

    threading.Thread(target=run, daemon=True).start()
