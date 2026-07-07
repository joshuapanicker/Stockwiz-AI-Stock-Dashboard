"""Fetch stock metrics and market context from Yahoo Finance."""

from __future__ import annotations
import math
from concurrent.futures import ThreadPoolExecutor
import yfinance as yf
from core.cache import fetch_through

METRICS_TTL = 300   # 5 min fresh
HISTORY_TTL = 300   # 5 min fresh
MARKET_TTL  = 120   # 2 min fresh
# Serve-stale windows: return the old value instantly and refresh in the
# background instead of making the user wait on yfinance.
METRICS_STALE = 3600   # 1 hr
HISTORY_STALE = 3600   # 1 hr
MARKET_STALE  = 1800   # 30 min


def _safe(val):
    """Convert to float, return None if nan/inf/invalid."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def _fetch_stock_metrics(symbol: str) -> dict:
    # fast_info, 1y history, and .info are three separate network round-trips;
    # .info alone can take seconds. Fetch them concurrently, each on its own
    # Ticker instance (the underlying HTTP session is not thread-safe).
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_fast = pool.submit(lambda: yf.Ticker(symbol).fast_info)
        f_hist = pool.submit(lambda: yf.Ticker(symbol).history(period="1y", interval="1d"))
        f_info = pool.submit(lambda: yf.Ticker(symbol).info or {})
        fi = f_fast.result()
        hist_1y = f_hist.result()
        info = f_info.result()

    # fast_info is more reliable than history() for current price
    close_price = _safe(fi.get("lastPrice") or fi.get("regularMarketPrice"))

    if hist_1y.empty:
        raise ValueError(f"No history found for {symbol}")

    hist_valid = hist_1y.dropna(subset=["Close"])
    latest_date = hist_valid.index[-1].strftime("%Y-%m-%d") if not hist_valid.empty else "N/A"

    if close_price is None and not hist_valid.empty:
        close_price = _safe(float(hist_valid["Close"].iloc[-1]))

    low_52w = _safe(float(hist_valid["Low"].min())) if not hist_valid.empty else None
    high_52w = _safe(float(hist_valid["High"].max())) if not hist_valid.empty else None

    distance_to_low = round((close_price - low_52w) / low_52w, 4) if (close_price and low_52w) else None
    distance_to_high = round((high_52w - close_price) / high_52w, 4) if (high_52w and close_price) else None

    return {
        "symbol": symbol,
        "date": latest_date,
        "close_price": close_price,
        "low_52_week": low_52w,
        "high_52_week": high_52w,
        "trailing_pe": _safe(info.get("trailingPE")),
        "forward_pe": _safe(info.get("forwardPE")),
        "profit_margin": _safe(info.get("profitMargins")),
        "operating_margin": _safe(info.get("operatingMargins")),
        "revenue_growth": _safe(info.get("revenueGrowth")),
        "earnings_growth": _safe(info.get("earningsGrowth")),
        "market_cap": _safe(info.get("marketCap")),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "distance_to_low_pct": distance_to_low,
        "distance_to_high_pct": distance_to_high,
        "closer_to_52w_low": (
            distance_to_low is not None
            and distance_to_high is not None
            and distance_to_low < distance_to_high
        ),
    }


def get_stock_metrics(symbol: str) -> dict:
    symbol = symbol.strip().upper()
    if not symbol:
        raise ValueError("Empty symbol")
    return fetch_through(f"metrics:{symbol}", METRICS_TTL,
                         lambda: _fetch_stock_metrics(symbol),
                         stale_ttl=METRICS_STALE)


def _fetch_market_context() -> dict:
    # One Ticker instance per thread — the underlying session isn't thread-safe
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_spy_price = pool.submit(lambda: _safe(yf.Ticker("SPY").fast_info.get("lastPrice")))
        f_vix_price = pool.submit(lambda: _safe(yf.Ticker("^VIX").fast_info.get("lastPrice")))
        f_spy_hist = pool.submit(lambda: yf.Ticker("SPY").history(period="6mo", interval="1d"))
        spy_latest = f_spy_price.result()
        vix_latest = f_vix_price.result()
        spy = f_spy_hist.result().dropna(subset=["Close"])

    spy_20dma = _safe(float(spy["Close"].tail(20).mean())) if len(spy) >= 20 else None
    spy_50dma = _safe(float(spy["Close"].tail(50).mean())) if len(spy) >= 50 else None

    market_trend = "unknown"
    if spy_latest and spy_20dma and spy_50dma:
        if spy_latest > spy_20dma > spy_50dma:
            market_trend = "bullish"
        elif spy_latest < spy_20dma < spy_50dma:
            market_trend = "bearish"
        else:
            market_trend = "mixed"

    return {
        "market_trend": market_trend,
        "vix": vix_latest,
        "spy_latest": spy_latest,
        "spy_20dma": spy_20dma,
        "spy_50dma": spy_50dma,
    }


def get_market_context() -> dict:
    return fetch_through("market", MARKET_TTL, _fetch_market_context,
                         stale_ttl=MARKET_STALE)


def _fetch_price_history(symbol: str, period: str) -> list[dict]:
    ticker = yf.Ticker(symbol.strip().upper())
    hist = ticker.history(period=period, interval="1d").dropna(subset=["Close"])
    if hist.empty:
        return []
    records = []
    for ts, row in hist.iterrows():
        o = _safe(float(row["Open"]))
        h = _safe(float(row["High"]))
        l = _safe(float(row["Low"]))
        c = _safe(float(row["Close"]))
        if c is None:
            continue
        records.append({
            "date": ts.strftime("%Y-%m-%d"),
            "open": o or c,
            "high": h or c,
            "low": l or c,
            "close": c,
            "volume": int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0,
        })
    return records


def get_price_history(symbol: str, period: str = "1y") -> list[dict]:
    """Return OHLCV history as a list of dicts for charting."""
    return fetch_through(f"history:{symbol}:{period}", HISTORY_TTL,
                         lambda: _fetch_price_history(symbol, period),
                         stale_ttl=HISTORY_STALE)
