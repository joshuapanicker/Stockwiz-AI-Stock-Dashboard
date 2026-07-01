"""
Background worker that fetches stock metrics for the full universe
and stores them in the SQLite universe cache.

Strategy
--------
- yfinance.download() with a group_by="ticker" batch call is used for price data
  (much faster than individual Ticker.history() calls per symbol).
- ticker.info is fetched individually but batched into small groups with a short
  delay to avoid rate limiting.
- The fetcher runs as a background thread; it respects an existing stop event so
  the FastAPI server can shut it down cleanly.
- Each symbol is only re-fetched when its cached record is older than UNIVERSE_RECORD_TTL.
"""

from __future__ import annotations

import math
import threading
import time
import yfinance as yf

from core.universe_cache import (
    get_universe_symbols,
    get_stale_symbols,
    upsert_stock,
    UNIVERSE_RECORD_TTL,
)

# Batch sizes and rate-limit courtesy delays
PRICE_BATCH_SIZE = 50       # symbols per yf.download() batch
INFO_BATCH_SIZE  = 10       # symbols per info-fetch group
BATCH_DELAY      = 1.5      # seconds between info batches
FULL_CYCLE_SLEEP = 3600     # re-check for stale data every hour


_stop_event = threading.Event()
_thread: threading.Thread | None = None
_lock = threading.Lock()

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


def _fetch_info_batch(symbols: list[str], price_data: dict[str, dict]) -> None:
    """
    For each symbol in the batch, merge ticker.info fundamentals with price_data
    and upsert into SQLite.
    """
    for symbol in symbols:
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
            # Mark symbol as errored but don't break the batch
            upsert_stock({"symbol": symbol}, error=str(e)[:200])

        with _lock:
            _progress["fetched"] += 1


def run_fetch_cycle(symbols: list[str] | None = None, force: bool = False) -> None:
    """
    Fetch data for stale (or all forced) symbols in the universe.
    Runs synchronously — call from a background thread.
    """
    if symbols is None:
        symbols = get_stale_symbols() if not force else get_universe_symbols()

    if not symbols:
        return

    with _lock:
        _progress["running"] = True
        _progress["total"] = len(symbols)
        _progress["fetched"] = 0

    try:
        # Step 1: batch price download in chunks of PRICE_BATCH_SIZE
        price_data: dict[str, dict] = {}
        for i in range(0, len(symbols), PRICE_BATCH_SIZE):
            if _stop_event.is_set():
                break
            batch = symbols[i: i + PRICE_BATCH_SIZE]
            price_data.update(_fetch_price_batch(batch))

        # Step 2: fetch info in smaller chunks (rate-limit friendly)
        for i in range(0, len(symbols), INFO_BATCH_SIZE):
            if _stop_event.is_set():
                break
            batch = symbols[i: i + INFO_BATCH_SIZE]
            _fetch_info_batch(batch, price_data)
            time.sleep(BATCH_DELAY)

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
