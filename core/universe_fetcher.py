"""
Background worker that fetches stock metrics for the full universe
and stores them in the SQLite universe cache.

Strategy (scaled for the ~6,000-symbol US-listed universe)
-----------------------------------------------------------
- Symbols are processed in priority order: the curated large-cap core first,
  then the full NASDAQ/NYSE/AMEX long tail — so the names users actually
  look at are populated within the first couple of minutes of a cold start.
- Work happens in chunks: one yf.download() batch price call per chunk
  (fast, threaded), then ticker.info fundamentals fetched CONCURRENTLY via a
  thread pool with a global rate throttle + 429-aware backoff.
- Everything user-facing reads from SQLite (WAL mode), so a running fetch
  never blocks or slows API requests.
- Each symbol is only re-fetched when its cached record is older than
  UNIVERSE_RECORD_TTL; errored symbols (delisted etc.) retry every 3 days.
"""

from __future__ import annotations

import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import yfinance as yf

from core.universe_cache import (
    get_universe_symbols,
    get_stale_symbols,
    upsert_stock,
)
from core.universe_symbols import refresh_universe_symbols

# Tunables (env-overridable for the hosted deployment)
PRICE_BATCH_SIZE = int(os.getenv("UNIVERSE_PRICE_BATCH", "100"))   # symbols per yf.download()
INFO_WORKERS     = int(os.getenv("UNIVERSE_INFO_WORKERS", "8"))    # concurrent info fetches
REQ_INTERVAL     = float(os.getenv("UNIVERSE_REQ_INTERVAL", "0.12"))  # min secs between request starts
FULL_CYCLE_SLEEP = 3600     # re-check for stale data every hour


_stop_event = threading.Event()
_thread: threading.Thread | None = None
_lock = threading.Lock()

# Global request pacing across worker threads
_throttle_lock = threading.Lock()
_last_request_start = 0.0

# When Yahoo rate-limits us, all workers back off until this timestamp
_backoff_until = 0.0

# Progress tracking (read by the API for status endpoint)
_progress = {"fetched": 0, "total": 0, "running": False, "last_run": None}


def _safe(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def _throttle() -> None:
    """Pace request starts globally; honor any active rate-limit backoff."""
    global _last_request_start
    while True:
        with _throttle_lock:
            now = time.time()
            wait = max(_backoff_until - now, _last_request_start + REQ_INTERVAL - now)
            if wait <= 0:
                _last_request_start = now
                return
        if _stop_event.wait(min(wait, 2.0)):
            return


def _note_rate_limit(seconds: float = 30.0) -> None:
    global _backoff_until
    with _throttle_lock:
        _backoff_until = max(_backoff_until, time.time() + seconds)


def _fetch_price_batch(symbols: list[str]) -> dict[str, dict]:
    """
    Use yf.download() to get 1-year OHLCV for a batch of symbols at once.
    Returns {symbol: {close, low_52w, high_52w}} — much faster than per-ticker calls.
    """
    results: dict[str, dict] = {}
    try:
        data = yf.download(
            symbols,
            period="1y",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            threads=True,
            progress=False,
        )

        if data.empty:
            return results

        for symbol in symbols:
            try:
                if len(symbols) == 1:
                    # Single symbol: data IS the frame
                    df = data.dropna(subset=["Close"])
                else:
                    df = data[symbol].dropna(subset=["Close"])

                if df.empty:
                    continue

                close = _safe(float(df["Close"].iloc[-1]))
                low_52w = _safe(float(df["Low"].min()))
                high_52w = _safe(float(df["High"].max()))

                if close and low_52w:
                    dist_low = round((close - low_52w) / low_52w, 4)
                else:
                    dist_low = None

                if close and high_52w:
                    dist_high = round((high_52w - close) / high_52w, 4)
                else:
                    dist_high = None

                results[symbol] = {
                    "symbol": symbol,
                    "close_price": close,
                    "low_52_week": low_52w,
                    "high_52_week": high_52w,
                    "distance_to_low_pct": dist_low,
                    "distance_to_high_pct": dist_high,
                    "closer_to_52w_low": (
                        dist_low is not None
                        and dist_high is not None
                        and dist_low < dist_high
                    ),
                }
            except Exception:
                continue

    except Exception:
        pass

    return results


def _fetch_one_info(symbol: str, price_data: dict[str, dict]) -> None:
    """Fetch fundamentals for one symbol (runs on a worker thread) and upsert."""
    if _stop_event.is_set():
        return
    _throttle()
    if _stop_event.is_set():
        return
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}

        base = price_data.get(symbol, {"symbol": symbol})

        # If price data was missing, try fast_info
        if not base.get("close_price"):
            fi = ticker.fast_info
            price = _safe(fi.get("lastPrice") or fi.get("regularMarketPrice"))
            if price:
                base["close_price"] = price

        metrics = {
            **base,
            "symbol": symbol,
            "trailing_pe":      _safe(info.get("trailingPE")),
            "forward_pe":       _safe(info.get("forwardPE")),
            "profit_margin":    _safe(info.get("profitMargins")),
            "operating_margin": _safe(info.get("operatingMargins")),
            "revenue_growth":   _safe(info.get("revenueGrowth")),
            "earnings_growth":  _safe(info.get("earningsGrowth")),
            "market_cap":       _safe(info.get("marketCap")),
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
        }

        upsert_stock(metrics, error=None)

    except Exception as e:
        msg = str(e)[:200]
        if "429" in msg or "Too Many Requests" in msg:
            _note_rate_limit()
        # Mark symbol as errored but don't break the cycle
        upsert_stock({"symbol": symbol}, error=msg)

    with _lock:
        _progress["fetched"] += 1


def run_fetch_cycle(symbols: list[str] | None = None, force: bool = False) -> None:
    """
    Fetch data for stale (or all forced) symbols in the universe.
    Runs synchronously — call from a background thread.
    """
    # Keep the symbol universe itself fresh (weekly listing-directory refresh)
    try:
        refresh_universe_symbols()
    except Exception:
        pass

    if symbols is None:
        symbols = get_stale_symbols() if not force else get_universe_symbols()

    if not symbols:
        return

    with _lock:
        _progress["running"] = True
        _progress["total"] = len(symbols)
        _progress["fetched"] = 0

    try:
        # Process chunk by chunk in priority order so high-interest symbols
        # land in the cache first: batch price download, then parallel info.
        with ThreadPoolExecutor(max_workers=INFO_WORKERS, thread_name_prefix="universe-info") as pool:
            for i in range(0, len(symbols), PRICE_BATCH_SIZE):
                if _stop_event.is_set():
                    break
                chunk = symbols[i: i + PRICE_BATCH_SIZE]
                price_data = _fetch_price_batch(chunk)

                futures = [pool.submit(_fetch_one_info, s, price_data) for s in chunk]
                for f in as_completed(futures):
                    if _stop_event.is_set():
                        break

    finally:
        with _lock:
            _progress["running"] = False
            _progress["last_run"] = time.time()


def _worker() -> None:
    """Main background thread loop."""
    # Initial fetch on startup
    run_fetch_cycle()

    # Periodic refresh
    while not _stop_event.is_set():
        _stop_event.wait(FULL_CYCLE_SLEEP)
        if not _stop_event.is_set():
            run_fetch_cycle()


def start_background_fetcher() -> None:
    """Launch the background fetch thread (idempotent)."""
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_worker, daemon=True, name="universe-fetcher")
    _thread.start()


def stop_background_fetcher() -> None:
    _stop_event.set()


def get_progress() -> dict:
    with _lock:
        return dict(_progress)
